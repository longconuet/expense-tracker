import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import {
  RENTAL_CATEGORY,
  buildRentalNote,
  computeRentalTotals,
  isValidDateInMonth,
  isValidMonth,
  type RentalConfig,
  type RentalMonth,
  type RentalMonthFields,
} from "@expense-tracker/shared";
import { AppError, sendOk } from "../lib/apiError.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireFamilyMember, requireOwner } from "../middlewares/requireFamily.js";
import { prisma } from "../prisma.js";

// Tiền phòng trọ hàng tháng — spec: docs/spec-rental.md
//
// GET  /                  → { config, months } (mọi member)
// PUT  /config            → upsert config mặc định (OWNER)
// GET  /months?year=      → list tháng (mọi member)
// POST /months            → tạo draft, prefill từ config + số công tơ tháng trước (OWNER)
// PUT  /months/:month     → sửa draft (OWNER)
// POST /months/:month/confirm → chốt: tạo/cập nhật 1 Expense + CONFIRMED (OWNER)
// DELETE /months/:month   → xoá tháng (đã chốt → xoá luôn expense) (OWNER)

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// Cap rộng cho input; guard tổng (INT_MAX) phía dưới chặn overflow cột
// Expense.amount (Postgres INTEGER).
const z_int = (max: number) => z.number().int().min(0).max(max);
const fixedCostField = z_int(1_000_000_000);
const rateField = z_int(10_000_000);
const meterField = z_int(1_000_000);

const configSchema = z.object({
  rent: fixedCostField,
  internet: fixedCostField,
  elevator: fixedCostField,
  parking: fixedCostField,
  electricityRate: rateField,
  waterRate: rateField,
});

const createMonthSchema = z.object({
  month: z.string().refine(isValidMonth, { message: "month phải có dạng YYYY-MM" }),
});

const monthFieldsSchema = z.object({
  rent: fixedCostField.optional(),
  internet: fixedCostField.optional(),
  elevator: fixedCostField.optional(),
  parking: fixedCostField.optional(),
  oldElec: meterField.optional(),
  newElec: meterField.optional(),
  electricityRate: rateField.optional(),
  oldWater: meterField.optional(),
  newWater: meterField.optional(),
  waterRate: rateField.optional(),
});

const updateMonthSchema = monthFieldsSchema.refine((value) => Object.keys(value).length > 0, {
  message: "Không có trường nào cần cập nhật",
});

const confirmMonthSchema = z.object({
  rent: fixedCostField,
  internet: fixedCostField,
  elevator: fixedCostField,
  parking: fixedCostField,
  oldElec: meterField,
  newElec: meterField,
  electricityRate: rateField,
  oldWater: meterField,
  newWater: meterField,
  waterRate: rateField,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "date phải có dạng YYYY-MM-DD" }),
});

/** Postgres INTEGER — guard để Expense.amount không overflow (500 Prisma). */
const PG_INT_MAX = 2_147_483_647;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MonthRow = Prisma.RentalMonthGetPayload<{}>;

function toMonthFields(row: Pick<
  MonthRow,
  | "rent"
  | "internet"
  | "elevator"
  | "parking"
  | "oldElec"
  | "newElec"
  | "electricityRate"
  | "oldWater"
  | "newWater"
  | "waterRate"
>): RentalMonthFields {
  return {
    rent: row.rent,
    internet: row.internet,
    elevator: row.elevator,
    parking: row.parking,
    oldElec: row.oldElec,
    newElec: row.newElec,
    electricityRate: row.electricityRate,
    oldWater: row.oldWater,
    newWater: row.newWater,
    waterRate: row.waterRate,
  };
}

/** Row Prisma → dto API: kèm computed fields (cùng hàm shared với FE). */
function toMonthDto(row: MonthRow): RentalMonth {
  const fields = toMonthFields(row);
  return {
    ...fields,
    id: row.id,
    month: row.month,
    status: row.status as RentalMonth["status"],
    expenseId: row.expenseId,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    ...computeRentalTotals(fields),
  };
}

function toConfigDto(row: Prisma.RentalConfigGetPayload<{}>): RentalConfig {
  return {
    rent: row.rent,
    internet: row.internet,
    elevator: row.elevator,
    parking: row.parking,
    electricityRate: row.electricityRate,
    waterRate: row.waterRate,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Số công tơ mới phải ≥ số cũ — so trên cặp giá trị GỌI LÊN (gộp với DB nếu
 * PUT chỉ gửi 1 trường) để chặn cả trường hợp đổi riêng lẻ 1 đầu.
 */
function assertMetersConsistent(month: {
  oldElec: number;
  newElec: number;
  oldWater: number;
  newWater: number;
}): void {
  if (month.newElec < month.oldElec) {
    throw new AppError(400, "VALIDATION_ERROR", "Số công tơ điện mới phải ≥ số cũ");
  }
  if (month.newWater < month.oldWater) {
    throw new AppError(400, "VALIDATION_ERROR", "Số công tơ nước mới phải ≥ số cũ");
  }
}

/** Chặn tổng vượt giới hạn cột Expense.amount (Postgres INTEGER). */
function assertAmountFits(fields: RentalMonthFields): void {
  const { total } = computeRentalTotals(fields);
  if (total > PG_INT_MAX) {
    throw new AppError(400, "VALIDATION_ERROR", "Tổng chi phí vượt quá giới hạn lưu trữ");
  }
}

export const rentalRouter = Router({ mergeParams: true });

rentalRouter.use(requireAuth, requireFamilyMember());

// ---------------------------------------------------------------------------
// Config mặc định
// ---------------------------------------------------------------------------

/** PUT /config — upsert (OWNER). */
rentalRouter.put("/config", requireOwner, validateBody(configSchema), async (req, res) => {
  const { familyId } = req.family!;
  const data = { ...req.body };
  const config = await prisma.rentalConfig.upsert({
    where: { familyId },
    create: { familyId, ...data },
    update: data,
  });
  sendOk(res, { config: toConfigDto(config) });
});

// ---------------------------------------------------------------------------
// Tổng quan (config + months)
// ---------------------------------------------------------------------------

/** GET / → 1 call cho màn list: config + mọi tháng (desc). */
rentalRouter.get("/", async (req, res) => {
  const { familyId } = req.family!;
  const [config, months] = await Promise.all([
    prisma.rentalConfig.findUnique({ where: { familyId } }),
    prisma.rentalMonth.findMany({ where: { familyId }, orderBy: { month: "desc" } }),
  ]);
  sendOk(res, {
    config: config ? toConfigDto(config) : null,
    months: months.map(toMonthDto),
  });
});

// ---------------------------------------------------------------------------
// Các tháng
// ---------------------------------------------------------------------------

/** GET /months?year=YYYY — desc theo tháng. */
rentalRouter.get("/months", async (req, res) => {
  const { familyId } = req.family!;
  // Cùng pattern resolveExpenseFilter: chỉ nhận string, rỗng/array = không lọc
  const rawYear = req.query.year;
  const year = typeof rawYear === "string" ? rawYear : undefined;
  let months: MonthRow[];
  if (year !== undefined) {
    if (!/^\d{4}$/.test(year)) {
      throw new AppError(400, "VALIDATION_ERROR", "year phải có dạng YYYY");
    }
    months = await prisma.rentalMonth.findMany({
      where: { familyId, month: { startsWith: `${year}-` } },
      orderBy: { month: "desc" },
    });
  } else {
    months = await prisma.rentalMonth.findMany({ where: { familyId }, orderBy: { month: "desc" } });
  }
  sendOk(res, { months: months.map(toMonthDto) });
});

/** POST /months — tạo draft (OWNER), prefill từ config + tháng trước. */
rentalRouter.post("/months", requireOwner, validateBody(createMonthSchema), async (req, res) => {
  const { familyId } = req.family!;
  const { month } = req.body;

  const config = await prisma.rentalConfig.findUnique({ where: { familyId } });
  if (!config) {
    throw new AppError(409, "RENTAL_CONFIG_NOT_SET", "Chưa có thông tin mặc định — hãy nhập ở màn Tiền phòng trọ");
  }

  const existing = await prisma.rentalMonth.findUnique({
    where: { familyId_month: { familyId, month } },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(409, "RENTAL_MONTH_EXISTS", "Tháng này đã có — hãy mở tháng đó ra");
  }

  // Mang số công tơ: old = new của tháng gần nhất TRƯỚC tháng này.
  const previous = await prisma.rentalMonth.findFirst({
    where: { familyId, month: { lt: month } },
    orderBy: { month: "desc" },
    select: { newElec: true, newWater: true },
  });

  const created = await prisma.rentalMonth.create({
    data: {
      familyId,
      month,
      rent: config.rent,
      internet: config.internet,
      elevator: config.elevator,
      parking: config.parking,
      electricityRate: config.electricityRate,
      waterRate: config.waterRate,
      oldElec: previous?.newElec ?? 0,
      newElec: previous?.newElec ?? 0,
      oldWater: previous?.newWater ?? 0,
      newWater: previous?.newWater ?? 0,
    },
  });

  sendOk(res, { month: toMonthDto(created) }, undefined, 201);
});

/** PUT /months/:month — sửa draft (OWNER). Tháng CONFIRMED → 409 (dùng confirm). */
rentalRouter.put(
  "/months/:month",
  requireOwner,
  validateBody(updateMonthSchema),
  async (req, res) => {
    const { familyId } = req.family!;
    const month = String(req.params.month ?? "");
    if (!isValidMonth(month)) {
      throw new AppError(400, "VALIDATION_ERROR", "month phải có dạng YYYY-MM");
    }

    const existing = await prisma.rentalMonth.findUnique({
      where: { familyId_month: { familyId, month } },
    });
    if (!existing) {
      throw new AppError(404, "MONTH_NOT_FOUND", "Không tìm thấy tháng này");
    }
    if (existing.status === "CONFIRMED") {
      throw new AppError(409, "RENTAL_MONTH_CONFIRMED", "Tháng đã chốt — hãy dùng “Chỉnh sửa & chốt lại”");
    }

    const data: Prisma.RentalMonthUpdateInput = {};
    for (const [key, value] of Object.entries(req.body) as [keyof RentalMonthFields, number][]) {
      if (value !== undefined) data[key] = value;
    }

    // Gộp với giá trị hiện có để check cặp công tơ (PUT có thể chỉ gửi 1 đầu).
    assertMetersConsistent({
      oldElec: (req.body.oldElec as number | undefined) ?? existing.oldElec,
      newElec: (req.body.newElec as number | undefined) ?? existing.newElec,
      oldWater: (req.body.oldWater as number | undefined) ?? existing.oldWater,
      newWater: (req.body.newWater as number | undefined) ?? existing.newWater,
    });

    const updated = await prisma.rentalMonth.update({ where: { id: existing.id }, data });
    sendOk(res, { month: toMonthDto(updated) });
  },
);

/**
 * POST /months/:month/confirm — chốt (OWNER).
 * DRAFT  → tạo Expense + CONFIRMED.
 * CONFIRMED → cập nhật tháng + cập nhật CÙNG Expense (re-chốt, không sinh khoản mới).
 * 1 transaction — không có trạng thái nửa vời.
 */
rentalRouter.post(
  "/months/:month/confirm",
  requireOwner,
  validateBody(confirmMonthSchema),
  async (req, res) => {
    const { familyId } = req.family!;
    const userId = req.auth!.userId;
    const month = String(req.params.month ?? "");
    if (!isValidMonth(month)) {
      throw new AppError(400, "VALIDATION_ERROR", "month phải có dạng YYYY-MM");
    }

    const fields = { ...req.body } as RentalMonthFields & { date: string };
    const { date } = fields;
    const { rent, internet, elevator, parking, oldElec, newElec, electricityRate, oldWater, newWater, waterRate } = fields;

    assertMetersConsistent({ oldElec, newElec, oldWater, newWater });
    if (!isValidDateInMonth(date, month)) {
      throw new AppError(400, "VALIDATION_ERROR", "date phải là ngày hợp lệ trong tháng này");
    }

    const totals = computeRentalTotals({
      rent, internet, elevator, parking, oldElec, newElec, electricityRate, oldWater, newWater, waterRate,
    });
    assertAmountFits({ rent, internet, elevator, parking, oldElec, newElec, electricityRate, oldWater, newWater, waterRate });

    const existing = await prisma.rentalMonth.findUnique({
      where: { familyId_month: { familyId, month } },
    });
    if (!existing) {
      throw new AppError(404, "MONTH_NOT_FOUND", "Không tìm thấy tháng này");
    }

    const note = buildRentalNote(month, {
      rent, internet, elevator, parking, oldElec, newElec, electricityRate, oldWater, newWater, waterRate,
    });

    const result = await prisma.$transaction(async (tx) => {
      // Category "Nhà trọ" — self-heal nếu user đã xoá preset.
      let category = await tx.category.findFirst({
        where: { familyId, name: RENTAL_CATEGORY.name },
        select: { id: true },
      });
      if (!category) {
        const maxOrder = await tx.category.aggregate({ where: { familyId }, _max: { order: true } });
        category = await tx.category.create({
          data: {
            familyId,
            name: RENTAL_CATEGORY.name,
            icon: RENTAL_CATEGORY.icon,
            isPreset: true,
            order: (maxOrder._max.order ?? -1) + 1,
          },
          select: { id: true },
        });
      }

      let expenseId = existing.expenseId;
      if (expenseId) {
        // Defensive: expenseId phải trỏ về expense của family này.
        const linked = await tx.expense.findUnique({
          where: { id: expenseId },
          select: { familyId: true },
        });
        if (!linked || linked.familyId !== familyId) {
          throw new AppError(409, "RENTAL_EXPENSE_INVALID", "Khoản chi liên kết không hợp lệ — hãy xoá tháng và chốt lại");
        }
        await tx.expense.update({
          where: { id: expenseId },
          data: { amount: totals.total, date, note, categoryId: category.id },
        });
      } else {
        const expense = await tx.expense.create({
          data: {
            familyId,
            userId,
            categoryId: category.id,
            amount: totals.total,
            date,
            note,
          },
          select: { id: true },
        });
        expenseId = expense.id;
      }

      const updatedMonth = await tx.rentalMonth.update({
        where: { id: existing.id },
        data: {
          rent, internet, elevator, parking, oldElec, newElec, electricityRate, oldWater, newWater, waterRate,
          status: "CONFIRMED",
          confirmedAt: new Date(),
          expenseId,
        },
      });

      return { month: updatedMonth, expenseId };
    });

    sendOk(res, { month: toMonthDto(result.month), expenseId: result.expenseId });
  },
);

/** DELETE /months/:month (OWNER) — đã chốt thì xoá luôn expense liên kết. */
rentalRouter.delete("/months/:month", requireOwner, async (req, res) => {
  const { familyId } = req.family!;
  const month = String(req.params.month ?? "");
  if (!isValidMonth(month)) {
    throw new AppError(400, "VALIDATION_ERROR", "month phải có dạng YYYY-MM");
  }

  const existing = await prisma.rentalMonth.findUnique({
    where: { familyId_month: { familyId, month } },
  });
  if (!existing) {
    throw new AppError(404, "MONTH_NOT_FOUND", "Không tìm thấy tháng này");
  }

  if (existing.expenseId) {
    await prisma.$transaction([
      prisma.expense.delete({ where: { id: existing.expenseId! } }),
      prisma.rentalMonth.delete({ where: { id: existing.id } }),
    ]);
  } else {
    await prisma.rentalMonth.delete({ where: { id: existing.id } });
  }

  sendOk(res, { ok: true });
});
