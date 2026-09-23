import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { AppError, sendOk } from "../lib/apiError.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireFamilyMember } from "../middlewares/requireFamily.js";
import { prisma } from "../prisma.js";

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(30),
  icon: z.string().min(1).max(8),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(30).optional(),
    icon: z.string().min(1).max(8).optional(),
    order: z.number().int().min(0).optional(),
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
  sendOk(res, { categories });
});

/** Thêm category tự tạo (khác preset) — tên unique trong family. */
categoryRouter.post("/", validateBody(createCategorySchema), async (req, res) => {
  const { familyId } = req.family!;
  const { name, icon } = req.body;

  const existing = await prisma.category.findUnique({
    where: { familyId_name: { familyId, name } },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(409, "CATEGORY_EXISTS", "Danh mục này đã tồn tại");
  }

  const maxOrder = await prisma.category.aggregate({ where: { familyId }, _max: { order: true } });
  const category = await prisma.category.create({
    data: { familyId, name, icon, isPreset: false, order: (maxOrder._max.order ?? -1) + 1 },
  });

  sendOk(res, { category }, undefined, 201);
});

/** Sửa category — preset chỉ đổi được order, không đổi name/icon. */
categoryRouter.put("/:categoryId", validateBody(updateCategorySchema), async (req, res) => {
  const { familyId } = req.family!;
  const categoryId = String(req.params.categoryId ?? "");
  const { name, icon, order } = req.body;

  const category = await prisma.category.findFirst({ where: { id: categoryId, familyId } });
  if (!category) {
    throw new AppError(404, "CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");
  }

  const presetTouched =
    category.isPreset &&
    ((name !== undefined && name !== category.name) || (icon !== undefined && icon !== category.icon));
  if (presetTouched) {
    throw new AppError(403, "PRESET_LOCKED", "Danh mục mặc định không thể đổi tên/icon");
  }

  const data: Prisma.CategoryUpdateInput = {};
  if (name !== undefined) data.name = name;
  if (icon !== undefined) data.icon = icon;
  if (order !== undefined) data.order = order;

  const updated = await prisma.category.update({ where: { id: category.id }, data });
  sendOk(res, { category: updated });
});

/** Xoá category — preset không xoá; đang có khoản chi thì không xoá. */
categoryRouter.delete("/:categoryId", async (req, res) => {
  const { familyId } = req.family!;
  const categoryId = String(req.params.categoryId ?? "");

  const category = await prisma.category.findFirst({ where: { id: categoryId, familyId } });
  if (!category) {
    throw new AppError(404, "CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");
  }
  if (category.isPreset) {
    throw new AppError(403, "PRESET_LOCKED", "Không xoá được danh mục mặc định");
  }

  const expenseCount = await prisma.expense.count({ where: { categoryId: category.id } });
  if (expenseCount > 0) {
    throw new AppError(409, "CATEGORY_IN_USE", "Danh mục đang có khoản chi — không thể xoá");
  }

  await prisma.category.delete({ where: { id: category.id } });
  sendOk(res, { ok: true });
});
