import type {
  ApiMeta,
  Category,
  Expense,
  Family,
  FamilyMemberDto,
  MonthlyStats,
} from "@expense-tracker/shared";
import { apiFetch, apiFetchWithMeta } from "./api";
import { withReadCache } from "./readCache";
import { enqueueExpense, isServerUnavailable } from "./syncQueue";

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
 * Mutation KHÔNG đi qua read cache; caller tự refetch categories
 * sau thao tác thành công để đồng bộ cache.
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
  return data.category;
}

/** Xoá danh mục — 409 khi đang có khoản chi (CATEGORY_IN_USE); mọi danh mục (kể cả preset) đều xoá được. */
export async function deleteCategory(familyId: string, categoryId: string): Promise<void> {
  await apiFetch(`/api/families/${familyId}/categories/${categoryId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export interface ExpenseListParams {
  month?: string;
  categoryId?: string;
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
  if (params.categoryId) query.set("categoryId", params.categoryId);
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
    return { expense: data.expense, savedOffline: false };
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

export async function deleteExpense(expenseId: string): Promise<void> {
  await apiFetch(`/api/expenses/${expenseId}`, { method: "DELETE" });
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
  input: UpdateExpenseInput,
): Promise<Expense> {
  const data = await apiFetch<{ expense: Expense }>(`/api/expenses/${expenseId}`, {
    method: "PUT",
    body: input,
  });
  return data.expense;
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
