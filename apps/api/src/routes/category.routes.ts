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

export const categoryRouter = Router({ mergeParams: true });

categoryRouter.use(requireAuth, requireFamilyMember());

/** Danh sách category của family, xếp theo order. */
categoryRouter.get("/", async (req, res) => {
  const { familyId } = req.family!;
  const categories = await prisma.category.findMany({
    where: { familyId },
    orderBy: { order: "asc" },
  });
  sendOk(res, { categories: categories.map(toCategoryDto) });
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

  const updated = await prisma.category.update({ where: { id: category.id }, data });
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
