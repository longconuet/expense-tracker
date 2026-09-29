import type {
  ApiMeta,
  ApiResponse,
  Category,
  Expense,
  Family,
  FamilyMemberDto,
  MonthlyStats,
} from "@expense-tracker/shared";
import { apiFetch, apiFetchBinary, apiFetchWithMeta, ApiError, isServerUnavailable } from "./api";
import { invalidateExpenseCache, invalidateFamilyCache } from "./cacheInvalidate";
import { monthOf } from "./dates";
import { withReadCache } from "./readCache";
import { enqueueExpense } from "./syncQueue";

/**
 * Lớp endpoint API cho FE — 1 nơi duy nhất map path + shape,
 * feature chỉ import từ đây (không gọi apiFetch trực tiếp).
 */

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

interface CategoriesData {
  categories: Category[];
}

export async function fetchCategories(familyId: string): Promise<Category[]> {
  const path = `/api/families/${familyId}/categories`;
  const data = await withReadCache<CategoriesData>(`GET ${path}`, () =>
    apiFetch<CategoriesData>(path),
  );
  return data.categories;
}

/**
 * CRUD category (mọi member được quyền — API enforce).
 * Mutation KHÔNG đi qua read cache; sau thao tác thành công tự xoá cache
 * của family (tên/icon danh mục nằm trong cả payload list expense + stats).
 */
export interface CreateCategoryInput {
  name: string;
  icon: string;
}

export interface UpdateCategoryInput {
  name?: string;
  icon?: string;
  order?: number;
}

/** Thêm danh mục tự tạo — order = max + 1 (hiện cuối list). 409 khi trùng tên. */
export async function createCategory(
  familyId: string,
  input: CreateCategoryInput,
): Promise<Category> {
  const data = await apiFetch<{ category: Category }>(`/api/families/${familyId}/categories`, {
    method: "POST",
    body: input,
  });
  invalidateFamilyCache(familyId);
  return data.category;
}

/** Sửa danh mục (mọi danh mục đều sửa được — kể cả preset khởi tạo). */
export async function updateCategory(
  familyId: string,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const data = await apiFetch<{ category: Category }>(
    `/api/families/${familyId}/categories/${categoryId}`,
    { method: "PUT", body: input },
  );
  invalidateFamilyCache(familyId);
  return data.category;
}

/** Xoá danh mục — 409 khi đang có khoản chi (CATEGORY_IN_USE); mọi danh mục (kể cả preset) đều xoá được. */
export async function deleteCategory(familyId: string, categoryId: string): Promise<void> {
  await apiFetch(`/api/families/${familyId}/categories/${categoryId}`, { method: "DELETE" });
  invalidateFamilyCache(familyId);
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export interface ExpenseListParams {
  month?: string;
  /** Lọc đúng 1 ngày (YYYY-MM-DD) — ưu tiên hơn `month`. */
  date?: string;
  categoryId?: string;
  /** Lọc theo người nhập khoản (member của family). */
  userId?: string;
  page?: number;
  pageSize?: number;
}

export interface ExpenseListResult {
  expenses: Expense[];
  meta: ApiMeta;
}

export async function fetchExpenses(
  familyId: string,
  params: ExpenseListParams = {},
): Promise<ExpenseListResult> {
  const query = new URLSearchParams();
  if (params.month) query.set("month", params.month);
  if (params.date) query.set("date", params.date);
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.userId) query.set("userId", params.userId);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  const path = `/api/families/${familyId}/expenses${qs ? `?${qs}` : ""}`;

  return withReadCache<ExpenseListResult>(`GET ${path}`, async () => {
    const { data, meta } = await apiFetchWithMeta<{ expenses: Expense[] }>(path);
    return {
      expenses: data.expenses,
      meta: meta ?? { page: 1, pageSize: data.expenses.length, total: data.expenses.length },
    };
  });
}

export type ExportFormat = "xlsx" | "csv";

export interface ExportExpensesParams {
  month?: string;
  categoryId?: string;
  userId?: string;
}

export interface ExportExpensesResult {
  blob: Blob;
  /** Tên file từ Content-Disposition (do server sinh toàn bộ). */
  filename: string;
}

/**
 * Export lịch sử chi tiêu ra file (xlsx/csv) — đúng filter đang bật trên màn,
 * không phân trang. Luôn gọi server trực tiếp (KHÔNG qua read cache);
 * 401 tự refresh + retry 1 lần (dùng chung với apiFetch).
 * Lỗi API vẫn trả envelope JSON — đọc để ném ApiError với message đúng.
 */
export async function exportExpenses(
  familyId: string,
  format: ExportFormat,
  params: ExportExpensesParams = {},
): Promise<ExportExpensesResult> {
  const query = new URLSearchParams();
  if (params.month) query.set("month", params.month);
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.userId) query.set("userId", params.userId);
  const qs = query.toString();
  const path = `/api/families/${familyId}/expenses/export.${format}${qs ? `?${qs}` : ""}`;

  const response = await apiFetchBinary(path);
  if (!response.ok) {
    let code = "UNKNOWN_ERROR";
    let message = `Xuất file thất bại (HTTP ${response.status})`;
    try {
      const body = (await response.json()) as ApiResponse<null>;
      if (body?.error) {
        code = body.error.code;
        message = body.error.message;
      }
    } catch {
      // Body không phải JSON (VD trang lỗi HTML của proxy) — giữ message mặc định
    }
    throw new ApiError(code, message, response.status);
  }

  const blob = await response.blob();
  const filename =
    /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ??
    `chi-tieu.${format === "csv" ? "csv" : "xlsx"}`;
  return { blob, filename };
}

export interface CreateExpenseInput {
  familyId: string;
  /** Danh mục đầy đủ — name/icon lưu kèm khoản khi ghi hàng đợi offline. */
  category: Category;
  amount: number;
  date: string;
  note?: string;
}

export interface CreateExpenseResult {
  expense: Expense | null;
  /** True khi server không đạt được — khoản đã lưu hàng đợi offline, tự sync sau. */
  savedOffline: boolean;
}

/**
 * Tạo khoản chi. Server không đạt được (lỗi mạng/5xx) → lưu hàng đợi offline
 * (IndexedDB) và trả về savedOffline = true. Lỗi API (4xx) ném như cũ.
 */
export async function createExpense(input: CreateExpenseInput): Promise<CreateExpenseResult> {
  const body = {
    familyId: input.familyId,
    categoryId: input.category.id,
    amount: input.amount,
    date: input.date,
    note: input.note || undefined,
  };
  try {
    const data = await apiFetch<{ expense: Expense }>("/api/expenses", {
      method: "POST",
      body,
    });
    const expense = data.expense;
    // Server đã nhận khoản — xoá cache list/stats của tháng + ngày đó
    invalidateExpenseCache(input.familyId, [monthOf(expense.date)], [expense.date]);
    return { expense, savedOffline: false };
  } catch (err) {
    if (isServerUnavailable(err)) {
      await enqueueExpense({
        familyId: input.familyId,
        categoryId: input.category.id,
        category: { name: input.category.name, icon: input.category.icon },
        amount: input.amount,
        date: input.date,
        note: input.note ? input.note.trim() : null,
      });
      return { expense: null, savedOffline: true };
    }
    throw err;
  }
}

export async function deleteExpense(
  expenseId: string,
  familyId: string,
  date: string,
): Promise<void> {
  await apiFetch(`/api/expenses/${expenseId}`, { method: "DELETE" });
  invalidateExpenseCache(familyId, [monthOf(date)], [date]);
}

export async function fetchExpense(expenseId: string): Promise<Expense> {
  const data = await apiFetch<{ expense: Expense }>(`/api/expenses/${expenseId}`);
  return data.expense;
}

export interface UpdateExpenseInput {
  categoryId?: string;
  amount?: number;
  date?: string;
  /** `null` = xoá ghi chú. */
  note?: string | null;
}

/**
 * Sửa khoản chi (PUT /api/expenses/:id). Chỉ người tạo hoặc owner —
 * API enforce, FE chỉ mở màn sửa khi có quyền.
 */
export async function updateExpense(
  expenseId: string,
  familyId: string,
  input: UpdateExpenseInput,
  /** Ngày của khoản TRƯỚC khi sửa — để xoá cache tháng cũ khi đổi ngày. */
  previousDate: string,
): Promise<Expense> {
  const data = await apiFetch<{ expense: Expense }>(`/api/expenses/${expenseId}`, {
    method: "PUT",
    body: input,
  });
  const expense = data.expense;
  invalidateExpenseCache(
    familyId,
    [monthOf(previousDate), monthOf(expense.date)],
    [previousDate, expense.date],
  );
  return expense;
}

// ---------------------------------------------------------------------------
// Family
// ---------------------------------------------------------------------------

export type FamilyDetail = Family & { members: FamilyMemberDto[] };

export async function fetchFamilyDetail(familyId: string): Promise<FamilyDetail> {
  const data = await apiFetch<{ family: FamilyDetail }>(`/api/families/${familyId}`);
  return data.family;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function fetchStats(familyId: string, month?: string): Promise<MonthlyStats> {
  const path = `/api/families/${familyId}/stats${month ? `?month=${month}` : ""}`;
  // Normalise byMember 1 nơi: read-cache offline có thể trả payload cũ (đúng phiên bản
  // trước khi có field) → consumer tin được type MonthlyStats (byMember luôn là array)
  const stats = await withReadCache<MonthlyStats>(`GET ${path}`, () =>
    apiFetch<MonthlyStats>(path),
  );
  return { ...stats, byMember: Array.isArray(stats.byMember) ? stats.byMember : [] };
}
