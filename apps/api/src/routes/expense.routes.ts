import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { AppError, sendOk } from "../lib/apiError.js";
import { MONTH_RE, isValidDateStr, nextMonthStart } from "../lib/dates.js";
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

/**
 * Tra khoản chi + enforce quyền sửa/xoá: chỉ NGƯỜI TẠO hoặc OWNER family.
 * Trả expense kèm relations để re-use cho response.
 */
async function requireExpenseAccess(expenseId: string, userId: string): Promise<ExpenseWithRelations> {
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

// ---------------------------------------------------------------------------
// Danh sách theo family: GET /api/families/:id/expenses (mount riêng)
// ---------------------------------------------------------------------------

export const expenseFamilyRouter = Router({ mergeParams: true });

expenseFamilyRouter.get("/", requireAuth, requireFamilyMember(), async (req, res) => {
  const { familyId } = req.family!;

  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));

  if (month && !MONTH_RE.test(month)) {
    throw new AppError(400, "VALIDATION_ERROR", "month phải có dạng YYYY-MM");
  }
  if (categoryId) {
    await assertCategoryInFamily(familyId, categoryId);
  }

  const where: Prisma.ExpenseWhereInput = { familyId };
  if (month) {
    where.date = { gte: `${month}-01`, lt: `${nextMonthStart(month)}-01` };
  }
  if (categoryId) {
    where.categoryId = categoryId;
  }

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

  sendOk(
    res,
    { expenses: items.map(toExpenseDto) },
    { page, pageSize, total },
  );
});

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
