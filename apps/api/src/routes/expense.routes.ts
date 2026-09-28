import { Prisma } from "@prisma/client";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { env } from "../env.js";
import { AppError, sendOk } from "../lib/apiError.js";
import { MONTH_RE, isValidDateStr, nextMonthStart } from "../lib/dates.js";
import {
  buildExpenseCsv,
  buildExpenseXlsx,
  expenseFileName,
  type ExportFormat,
  type ExportRow,
} from "../lib/expenseExport.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireFamilyMember } from "../middlewares/requireFamily.js";
import { prisma } from "../prisma.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date phải có dạng YYYY-MM-DD")
  .refine(isValidDateStr, { message: "date không phải ngày hợp lệ" });

const amountField = z.number().int("amount phải là số nguyên").min(1).max(1_000_000_000_000);

const createExpenseSchema = z.object({
  familyId: z.string().min(1),
  categoryId: z.string().min(1),
  amount: amountField,
  date: dateField,
  note: z.string().trim().max(200).optional(),
});

const updateExpenseSchema = z
  .object({
    categoryId: z.string().min(1).optional(),
    amount: amountField.optional(),
    date: dateField.optional(),
    note: z.union([z.string().trim().max(200), z.null()]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Không có trường nào cần cập nhật",
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExpenseWithRelations = Prisma.ExpenseGetPayload<{
  include: { category: true; user: { select: { name: true } } };
}>;

function toExpenseDto(expense: ExpenseWithRelations) {
  return {
    id: expense.id,
    amount: expense.amount,
    date: expense.date,
    note: expense.note,
    category: {
      id: expense.category.id,
      name: expense.category.name,
      icon: expense.category.icon,
      isPreset: expense.category.isPreset,
      order: expense.category.order,
    },
    createdByName: expense.user.name,
    createdAt: expense.createdAt.toISOString(),
  };
}

async function assertFamilyMember(familyId: string, userId: string) {
  const membership = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId, userId } },
  });
  if (!membership) {
    throw new AppError(403, "NOT_FAMILY_MEMBER", "Bạn không phải thành viên của gia đình này");
  }
  return membership;
}

async function assertCategoryInFamily(familyId: string, categoryId: string) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, familyId } });
  if (!category) {
    throw new AppError(404, "CATEGORY_NOT_FOUND", "Danh mục không thuộc gia đình này");
  }
  return category;
}

/** Filter `userId` — người không phải thành viên family → 404 (giống precedent categoryId). */
async function assertUserInFamily(familyId: string, userId: string) {
  const membership = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId, userId } },
  });
  if (!membership) {
    throw new AppError(404, "USER_NOT_IN_FAMILY", "Thành viên không thuộc gia đình này");
  }
  return membership;
}

/**
 * Tra khoản chi + enforce quyền sửa/xoá: chỉ NGƯỜI TẠO hoặc OWNER family.
 * Trả expense kèm relations để re-use cho response.
 */
async function requireExpenseAccess(
  expenseId: string,
  userId: string,
): Promise<ExpenseWithRelations> {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { category: true, user: { select: { name: true } } },
  });
  if (!expense) {
    throw new AppError(404, "EXPENSE_NOT_FOUND", "Không tìm thấy khoản chi");
  }

  const membership = await assertFamilyMember(expense.familyId, userId);
  const canEdit = membership.role === "OWNER" || expense.userId === userId;
  if (!canEdit) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Chỉ người tạo hoặc chủ gia đình mới sửa/xoá được khoản chi này",
    );
  }

  return expense;
}

/**
 * Validate query params + build `where` cho list/export khoản chi — 1 nguồn
 * filter duy nhất, dùng chung bởi list (GET /) và export (GET /export.*).
 * `scope` (date > month > "toan-bo") dùng sinh tên file export.
 */
async function resolveExpenseFilter(
  familyId: string,
  query: Record<string, unknown>,
): Promise<{ where: Prisma.ExpenseWhereInput; scope: string }> {
  const month = typeof query.month === "string" ? query.month : undefined;
  const categoryId = typeof query.categoryId === "string" ? query.categoryId : undefined;
  const date = typeof query.date === "string" ? query.date : undefined;
  const userId = typeof query.userId === "string" ? query.userId : undefined;

  if (month && !MONTH_RE.test(month)) {
    throw new AppError(400, "VALIDATION_ERROR", "month phải có dạng YYYY-MM");
  }
  if (date && !isValidDateStr(date)) {
    throw new AppError(400, "VALIDATION_ERROR", "date phải có dạng YYYY-MM-DD và là ngày hợp lệ");
  }
  // `?date[]=...` (array/object) — từ chối rõ thay vì bỏ qua filter như tháng
  if (query.date !== undefined && typeof query.date !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", "date phải có dạng YYYY-MM-DD và là ngày hợp lệ");
  }
  // `?userId[]=...` (array/object) — từ chối rõ (precedent date)
  if (query.userId !== undefined && typeof query.userId !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", "userId không hợp lệ");
  }
  if (categoryId) {
    await assertCategoryInFamily(familyId, categoryId);
  }
  if (userId) {
    await assertUserInFamily(familyId, userId);
  }

  const where: Prisma.ExpenseWhereInput = { familyId };
  if (date) {
    // Lọc đúng 1 ngày (VD popup chi tiết ngày từ lịch thống kê) — ưu tiên hơn month
    where.date = date;
  } else if (month) {
    where.date = { gte: `${month}-01`, lt: `${nextMonthStart(month)}-01` };
  }
  if (categoryId) {
    where.categoryId = categoryId;
  }
  if (userId) {
    where.userId = userId;
  }

  // `||` chứ không phải `??` — month/date rỗng (`?month=`) vẫn coi như "toan-bo"
  return { where, scope: date || month || "toan-bo" };
}

// ---------------------------------------------------------------------------
// Danh sách theo family: GET /api/families/:id/expenses (mount riêng)
// ---------------------------------------------------------------------------

export const expenseFamilyRouter = Router({ mergeParams: true });

expenseFamilyRouter.get("/", requireAuth, requireFamilyMember(), async (req, res) => {
  const { familyId } = req.family!;
  const { where } = await resolveExpenseFilter(familyId, req.query);

  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20),
  );

  const [total, items] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where,
      include: { category: true, user: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  sendOk(res, { expenses: items.map(toExpenseDto) }, { page, pageSize, total });
});

// ---------------------------------------------------------------------------
// Export: GET /api/families/:id/expenses/export.<format> (mount riêng)
// - xlsx: Excel · csv: mở thẳng lên Google Sheets (File → Import)
// - Filter + quyền giống list; không phân trang; cap dòng = env.EXPORT_MAX_ROWS
// - Thành công: file binary (Content-Disposition: attachment) — KHÔNG envelope JSON;
//   lỗi (4xx) vẫn là envelope JSON qua errorHandler
// ---------------------------------------------------------------------------

function exportHandler(format: ExportFormat): RequestHandler {
  return async (req, res) => {
    const { familyId } = req.family!;
    const { where, scope } = await resolveExpenseFilter(familyId, req.query);

    // Cap dòng — 409 rõ ràng hơn là response khổng lồ bị Vercel cắt
    const total = await prisma.expense.count({ where });
    if (total > env.exportMaxRows) {
      throw new AppError(
        409,
        "EXPORT_LIMIT_EXCEEDED",
        `Số dòng dữ liệu (${total}) vượt quá giới hạn ${env.exportMaxRows}. Vui lòng lọc theo tháng hoặc danh mục hẹp hơn.`,
      );
    }

    // take = cap — đóng khe TOCTOU giữa count và findMany: có thêm khoản mới
    // trong lúc export thì file vẫn không vượt cap
    const items = await prisma.expense.findMany({
      where,
      include: { category: true, user: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: env.exportMaxRows,
    });

    const rows: ExportRow[] = items.map((item) => ({
      date: item.date,
      amount: item.amount,
      note: item.note,
      category: item.category.name,
      createdByName: item.user.name,
      createdAt: item.createdAt,
    }));

    // Build file TRƯỚC khi set header — nếu exceljs lỗi, response 500 (envelope
    // JSON) không dính header attachment
    let body: string | Uint8Array;
    if (format === "xlsx") {
      body = await buildExpenseXlsx(rows);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    } else {
      body = buildExpenseCsv(rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
    }
    // Tên file do server sinh toàn bộ (không dính user input) → an toàn dùng thẳng
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${expenseFileName(scope, format)}"`,
    );
    res.setHeader(
      "Content-Length",
      typeof body === "string" ? Buffer.byteLength(body) : body.length,
    );
    res.send(body);
  };
}

expenseFamilyRouter.get("/export.xlsx", requireAuth, requireFamilyMember(), exportHandler("xlsx"));
expenseFamilyRouter.get("/export.csv", requireAuth, requireFamilyMember(), exportHandler("csv"));

// ---------------------------------------------------------------------------
// CRUD theo id: /api/expenses
// ---------------------------------------------------------------------------

export const expenseRouter = Router();

expenseRouter.use(requireAuth);

expenseRouter.post("/", validateBody(createExpenseSchema), async (req, res) => {
  const { userId } = req.auth!;
  const { familyId, categoryId, amount, date, note } = req.body;

  await assertFamilyMember(familyId, userId);
  await assertCategoryInFamily(familyId, categoryId);

  const expense = await prisma.expense.create({
    data: { familyId, userId, categoryId, amount, date, note: note ?? null },
    include: { category: true, user: { select: { name: true } } },
  });

  sendOk(res, { expense: toExpenseDto(expense) }, undefined, 201);
});

expenseRouter.get("/:id", async (req, res) => {
  const expenseId = String(req.params.id ?? "");
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { category: true, user: { select: { name: true } } },
  });
  if (!expense) {
    throw new AppError(404, "EXPENSE_NOT_FOUND", "Không tìm thấy khoản chi");
  }

  await assertFamilyMember(expense.familyId, req.auth!.userId);
  sendOk(res, { expense: toExpenseDto(expense) });
});

expenseRouter.put("/:id", validateBody(updateExpenseSchema), async (req, res) => {
  const expenseId = String(req.params.id ?? "");
  const existing = await requireExpenseAccess(expenseId, req.auth!.userId);
  const { categoryId, amount, date, note } = req.body;

  const data: Prisma.ExpenseUpdateInput = {};
  if (amount !== undefined) data.amount = amount;
  if (date !== undefined) data.date = date;
  if (note !== undefined) data.note = note;
  if (categoryId !== undefined) {
    await assertCategoryInFamily(existing.familyId, categoryId);
    data.category = { connect: { id: categoryId } };
  }

  const expense = await prisma.expense.update({
    where: { id: expenseId },
    data,
    include: { category: true, user: { select: { name: true } } },
  });

  sendOk(res, { expense: toExpenseDto(expense) });
});

expenseRouter.delete("/:id", async (req, res) => {
  const expenseId = String(req.params.id ?? "");
  await requireExpenseAccess(expenseId, req.auth!.userId);
  await prisma.expense.delete({ where: { id: expenseId } });
  sendOk(res, { ok: true });
});
