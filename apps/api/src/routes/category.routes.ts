import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { AppError, sendOk } from "../lib/apiError.js";
import { parseNoteSuggestions } from "../lib/noteSuggestions.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireFamilyMember } from "../middlewares/requireFamily.js";
import { prisma } from "../prisma.js";

/** Row Prisma → response API: `noteSuggestions` parse từ JSON string về array. */
function toCategoryDto(row: {
  id: string;
  familyId: string;
  name: string;
  icon: string;
  isPreset: boolean;
  order: number;
  noteSuggestions: string | null;
}) {
  return {
    ...row,
    noteSuggestions: parseNoteSuggestions(row.noteSuggestions),
  };
}

/**
 * Gợi ý ghi chú nhanh: ≤8 mục, mỗi mục 1–30 ký tự (đã trim).
 * Giữ 3 trạng thái phân biệt: `undefined` = không có key (PUT: không động),
 * `null` = xoá hết, `string[]` = thay thế (rỗng → bình thường hoá về `null`).
 */
const noteSuggestionsSchema = z
  .array(z.string().trim().min(1).max(30))
  .max(8)
  .optional()
  .nullable()
  .transform((value) => {
    if (value === undefined || value === null) return value;
    return value.length > 0 ? value : null;
  });

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(30),
  icon: z.string().min(1).max(8),
  noteSuggestions: noteSuggestionsSchema,
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(30).optional(),
    icon: z.string().min(1).max(8).optional(),
    order: z.number().int().min(0).optional(),
    noteSuggestions: noteSuggestionsSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Không có trường nào cần cập nhật",
  });

/** Hoán đổi vị trí 2 category (nút lên/xuống trên FE). */
const swapCategoriesSchema = z.object({
  categoryId: z.string().min(1),
  targetId: z.string().min(1),
});

export const categoryRouter = Router({ mergeParams: true });

categoryRouter.use(requireAuth, requireFamilyMember());

/**
 * Danh sách category của family, xếp theo order.
 * Tie-break bằng `id` (cuid — tăng theo thời gian): nếu data cũ còn 2 hàng
 * trùng `order` (hệ quả của cách đổi thứ tự 2 PUT cũ), thứ tự list vẫn
 * XÁC ĐỊNH giữa các lần fetch thay vì nhảy loạn.
 */
categoryRouter.get("/", async (req, res) => {
  const { familyId } = req.family!;
  const categories = await prisma.category.findMany({
    where: { familyId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
  sendOk(res, { categories: categories.map(toCategoryDto) });
});

/**
 * Hoán đổi `order` của 2 category — 1 transaction (cả 2 thành công hoặc cả 2
 * roll back). Thay thế cách 2 PUT song song của FE: PUT độc lập có thể fail
 * một nửa → 2 hàng trùng `order` → thứ tự list KHÔNG XÁC ĐỊNH (bẫy đã ghi).
 */
categoryRouter.post("/swap", validateBody(swapCategoriesSchema), async (req, res) => {
  const { familyId } = req.family!;
  const { categoryId, targetId } = req.body;
  if (categoryId === targetId) {
    throw new AppError(400, "VALIDATION_ERROR", "Cần 2 danh mục khác nhau để đổi thứ tự");
  }

  const [updatedFirst, updatedSecond] = await prisma.$transaction(async (tx) => {
    // Đọc 2 row MỚI NHẤT + khoá row (ORDER BY id → thứ tự khoá XÁC ĐỊNH, tránh
    // deadlock khi 2 swap chồng row chạy song song — VD 2 member cùng reorder).
    // Không khoá: 2 tx cùng đọc pre-image rồi swap → có thể sinh order trùng.
    const rows = await tx.$queryRaw<{ id: string; order: number }[]>(
      Prisma.sql`SELECT "id", "order" FROM "Category"
                 WHERE "familyId" = ${familyId} AND "id" IN (${categoryId}, ${targetId})
                 ORDER BY "id" FOR UPDATE`,
    );
    if (rows.length !== 2) {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");
    }
    const first = rows.find((row) => row.id === categoryId)!;
    const second = rows.find((row) => row.id === targetId)!;
    return Promise.all([
      tx.category.update({ where: { id: first.id }, data: { order: second.order } }),
      tx.category.update({ where: { id: second.id }, data: { order: first.order } }),
    ]);
  });

  sendOk(res, {
    categories: [toCategoryDto(updatedFirst), toCategoryDto(updatedSecond)],
  });
});

/** Thêm category tự tạo (khác preset) — tên unique trong family. */
categoryRouter.post("/", validateBody(createCategorySchema), async (req, res) => {
  const { familyId } = req.family!;
  const { name, icon, noteSuggestions } = req.body;

  const existing = await prisma.category.findUnique({
    where: { familyId_name: { familyId, name } },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(409, "CATEGORY_EXISTS", "Danh mục này đã tồn tại");
  }

  const maxOrder = await prisma.category.aggregate({ where: { familyId }, _max: { order: true } });
  const category = await prisma.category.create({
    data: {
      familyId,
      name,
      icon,
      isPreset: false,
      order: (maxOrder._max.order ?? -1) + 1,
      noteSuggestions: noteSuggestions ? JSON.stringify(noteSuggestions) : null,
    },
  });

  sendOk(res, { category: toCategoryDto(category) }, undefined, 201);
});

/** Sửa category — mọi danh mục (kể cả preset khởi tạo) đều sửa được. */
categoryRouter.put("/:categoryId", validateBody(updateCategorySchema), async (req, res) => {
  const { familyId } = req.family!;
  const categoryId = String(req.params.categoryId ?? "");
  const { name, icon, order, noteSuggestions } = req.body;

  const category = await prisma.category.findFirst({ where: { id: categoryId, familyId } });
  if (!category) {
    throw new AppError(404, "CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");
  }

  const data: Prisma.CategoryUpdateInput = {};
  if (name !== undefined) data.name = name;
  if (icon !== undefined) data.icon = icon;
  if (order !== undefined) data.order = order;
  // undefined = không động; null (hoặc []) = xoá hết; array = thay thế
  if (noteSuggestions !== undefined) {
    data.noteSuggestions = noteSuggestions ? JSON.stringify(noteSuggestions) : null;
  }

  let updated;
  try {
    updated = await prisma.category.update({ where: { id: category.id }, data });
  } catch (err) {
    // P2002: trùng (familyId, name) — trả 409 như POST thay vì 500
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "CATEGORY_EXISTS", "Danh mục này đã tồn tại");
    }
    throw err;
  }
  sendOk(res, { category: toCategoryDto(updated) });
});

/** Xoá category — mọi danh mục đều xoá được (chặn khi đang có khoản chi). */
categoryRouter.delete("/:categoryId", async (req, res) => {
  const { familyId } = req.family!;
  const categoryId = String(req.params.categoryId ?? "");

  const category = await prisma.category.findFirst({ where: { id: categoryId, familyId } });
  if (!category) {
    throw new AppError(404, "CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");
  }

  const expenseCount = await prisma.expense.count({ where: { categoryId: category.id } });
  if (expenseCount > 0) {
    throw new AppError(409, "CATEGORY_IN_USE", "Danh mục đang có khoản chi — không thể xoá");
  }

  await prisma.category.delete({ where: { id: category.id } });
  sendOk(res, { ok: true });
});
