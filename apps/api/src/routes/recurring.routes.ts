import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import {
  anchorDayOf,
  firstOccurrenceFrom,
  materializeDates,
  nextOccurrence,
  type RecurringEndType,
  type RecurringRule,
} from "@expense-tracker/shared";
import { AppError, sendOk } from "../lib/apiError.js";
import { isValidDateStr, todayStr } from "../lib/dates.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireFamilyMember, requireOwner } from "../middlewares/requireFamily.js";
import { prisma } from "../prisma.js";
import { assertCategoryInFamily, assertFamilyMember } from "./expense.routes.js";

// Giao dịch định kỳ — lặp hàng tháng. Spec: docs/spec-recurring.md
//
// Family-scoped:  GET  /                        → { rules } (mọi member)
//                 POST /                        → tạo rule (OWNER)
//                 POST /materialize             → sinh khoản quá hạn (mọi member)
// Theo id:        GET  /api/recurring/:id       → rule (member của rule.familyId)
//                 PUT  /api/recurring/:id       → sửa + tính lại nextDate (người tạo/OWNER)
//                 DELETE /api/recurring/:id     → xoá rule, khoản đã sinh giữ lại
//
// Tần suất MVP cố định "MONTHLY" (user chốt 01/10/2026) — không có selector;
// cột `frequency` giữ giá trị default để mở rộng additive sau này.

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const dateField = (name: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${name} phải có dạng YYYY-MM-DD`)
    .refine(isValidDateStr, { message: `${name} không phải ngày hợp lệ` });

const amountField = z
  .number()
  .int("amount phải là số nguyên")
  .min(1, "amount phải lớn hơn 0")
  .max(1_000_000_000_000, "amount vượt quá giới hạn");

const countField = z
  .number()
  .int("occurrenceCount phải là số nguyên")
  .min(1, "occurrenceCount phải lớn hơn 0")
  .max(10_000, "occurrenceCount vượt quá giới hạn");

const endTypeField = z.enum(["FOREVER", "UNTIL_DATE", "COUNT"], {
  message: "endType phải là FOREVER, UNTIL_DATE hoặc COUNT",
});

const createRuleSchema = z.object({
  categoryId: z.string().min(1),
  amount: amountField,
  note: z.string().trim().max(200, "note tối đa 200 ký tự").optional(),
  startDate: dateField("startDate"),
  endType: endTypeField,
  endDate: dateField("endDate").optional(),
  occurrenceCount: countField.optional(),
});

const updateRuleSchema = z
  .object({
    categoryId: z.string().min(1).optional(),
    amount: amountField.optional(),
    note: z.union([z.string().trim().max(200, "note tối đa 200 ký tự"), z.null()]).optional(),
    startDate: dateField("startDate").optional(),
    endType: endTypeField.optional(),
    // PUT cho phép null = xoá endDate/occurrenceCount (chuyển về FOREVER)
    endDate: z.union([dateField("endDate"), z.null()]).optional(),
    occurrenceCount: z.union([countField, z.null()]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Không có trường nào cần cập nhật",
  });

/**
 * Validate cross-field điều kiện kết thúc — 1 nguồn cho POST và PUT
 * (PUT validate trên giá trị gộp body ?? hiện có). `today` = todayStr().
 */
function assertEndConditions(
  startDate: string,
  endType: RecurringEndType,
  endDate: string | null | undefined,
  occurrenceCount: number | null | undefined,
  today: string,
): void {
  if (endType === "UNTIL_DATE") {
    if (!endDate) {
      throw new AppError(400, "VALIDATION_ERROR", "endType UNTIL_DATE yêu cầu endDate");
    }
    const first = firstOccurrenceFrom(startDate, today);
    if (endDate < first) {
      const [y, m, d] = first.split("-");
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Ngày kết thúc phải sau ngày định kỳ đầu tiên (${d}/${m}/${y})`,
      );
    }
  }
  if (endType === "COUNT" && occurrenceCount == null) {
    throw new AppError(400, "VALIDATION_ERROR", "endType COUNT yêu cầu occurrenceCount");
  }
  if (endType === "FOREVER" && (endDate != null || occurrenceCount != null)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "endType FOREVER không kèm endDate/occurrenceCount",
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RuleRow = Prisma.RecurringRuleGetPayload<{ include: { category: true } }>;

function toRuleDto(row: RuleRow): RecurringRule {
  return {
    id: row.id,
    familyId: row.familyId,
    categoryId: row.categoryId,
    category: {
      id: row.category.id,
      name: row.category.name,
      icon: row.category.icon,
      isPreset: row.category.isPreset,
      order: row.category.order,
    },
    amount: row.amount,
    note: row.note,
    frequency: "MONTHLY",
    startDate: row.startDate,
    endType: row.endType as RecurringEndType,
    endDate: row.endDate,
    occurrenceCount: row.occurrenceCount,
    nextDate: row.nextDate,
    generatedCount: row.generatedCount,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Family-scoped: /api/families/:id/recurring
// ---------------------------------------------------------------------------

export const recurringRouter = Router({ mergeParams: true });

recurringRouter.use(requireAuth, requireFamilyMember());

recurringRouter.get("/", async (req, res) => {
  const { familyId } = req.family!;
  const rules = await prisma.recurringRule.findMany({
    where: { familyId },
    orderBy: { createdAt: "desc" },
    include: { category: true },
  });
  sendOk(res, { rules: rules.map(toRuleDto) });
});

recurringRouter.post("/", requireOwner, validateBody(createRuleSchema), async (req, res) => {
  const { familyId } = req.family!;
  const { categoryId, amount, note, startDate, endType, endDate, occurrenceCount } = req.body;

  await assertCategoryInFamily(familyId, categoryId);
  const today = todayStr();
  assertEndConditions(startDate, endType, endDate, occurrenceCount, today);

  // Không sinh bù quá khứ (spec §1): kỳ đầu tiên = kỳ đầu tiên ≥ today
  const rule = await prisma.recurringRule.create({
    data: {
      familyId,
      userId: req.auth!.userId,
      categoryId,
      amount,
      note: note ?? null,
      startDate,
      endType,
      endDate: endDate ?? null,
      occurrenceCount: occurrenceCount ?? null,
      nextDate: firstOccurrenceFrom(startDate, today),
    },
    include: { category: true },
  });
  sendOk(res, { rule: toRuleDto(rule) }, undefined, 201);
});

/**
 * Sinh các khoản quá hạn của MỌI rule active trong family (1 tick).
 * Lazy materialization — FE gọi khi app online + active family (không có cron).
 * An toàn chạy song song: 1 transaction/family + row lock FOR UPDATE + re-read
 * (precedent `rental confirm`) — tick sau thấy nextDate đã tiến → 0 kỳ.
 */
recurringRouter.post("/materialize", async (req, res) => {
  const { familyId } = req.family!;
  const today = todayStr();
  const created: Array<{ expenseId: string; date: string; month: string }> = [];

  await prisma.$transaction(async (tx) => {
    const due = await tx.recurringRule.findMany({
      where: { familyId, nextDate: { lte: today } },
    });

    for (const pending of due) {
      // Khoá row + re-read: 2 tick song song trên rule cùng bị serialise —
      // tick về sau thấy nextDate đã được tick trước tiến → bỏ qua.
      await tx.$queryRaw`SELECT "id" FROM "RecurringRule" WHERE "id" = ${pending.id} FOR UPDATE`;
      const rule = await tx.recurringRule.findUnique({ where: { id: pending.id } });
      if (!rule || rule.nextDate === null || rule.nextDate > today) continue;

      const result = materializeDates(
        {
          nextDate: rule.nextDate,
          anchorDay: anchorDayOf(rule.startDate),
          endType: rule.endType as RecurringEndType,
          endDate: rule.endDate,
          occurrenceCount: rule.occurrenceCount,
          generatedCount: rule.generatedCount,
        },
        today,
      );

      if (result.dates.length === 0) {
        // 0 kỳ (VD rule vừa hết hạn giữa chừng) — vẫn đánh dấu hoàn tất nếu cần
        if (result.completed) {
          await tx.recurringRule.update({
            where: { id: rule.id },
            data: { nextDate: null, completedAt: new Date() },
          });
        }
        continue;
      }

      for (const date of result.dates) {
        const expense = await tx.expense.create({
          data: {
            familyId,
            // Người setup rule — KHÔNG phải người gọi materialize
            userId: rule.userId,
            categoryId: rule.categoryId,
            amount: rule.amount,
            note: rule.note,
            date,
            recurringRuleId: rule.id,
          },
          select: { id: true },
        });
        created.push({ expenseId: expense.id, date, month: date.slice(0, 7) });
      }

      await tx.recurringRule.update({
        where: { id: rule.id },
        data: {
          generatedCount: rule.generatedCount + result.dates.length,
          nextDate: result.nextDate,
          completedAt: result.completed ? new Date() : rule.completedAt,
        },
      });
    }
  });

  sendOk(res, { count: created.length, created });
});

// ---------------------------------------------------------------------------
// Theo id: /api/recurring/:id — membership kiểm tra qua rule.familyId
// (pattern requireExpenseAccess của expense.routes.ts)
// ---------------------------------------------------------------------------

export const recurringByIdRouter = Router();

recurringByIdRouter.use(requireAuth);

async function findRuleOr404(ruleId: string): Promise<RuleRow> {
  const rule = await prisma.recurringRule.findUnique({
    where: { id: ruleId },
    include: { category: true },
  });
  if (!rule) {
    throw new AppError(404, "RECURRING_RULE_NOT_FOUND", "Không tìm thấy rule định kỳ");
  }
  return rule;
}

/** Quyền sửa/xoá: chỉ NGƯỜI TẠO rule hoặc OWNER family (spec §3.1). */
async function assertRuleWritable(
  rule: { familyId: string; userId: string },
  userId: string,
  action: "sửa" | "xoá",
): Promise<void> {
  const membership = await assertFamilyMember(rule.familyId, userId);
  if (membership.role !== "OWNER" && rule.userId !== userId) {
    throw new AppError(
      403,
      "FORBIDDEN",
      `Chỉ người tạo hoặc chủ gia đình mới ${action} được rule này`,
    );
  }
}

recurringByIdRouter.get("/:id", async (req, res) => {
  const rule = await findRuleOr404(String(req.params.id ?? ""));
  await assertFamilyMember(rule.familyId, req.auth!.userId);
  sendOk(res, { rule: toRuleDto(rule) });
});

recurringByIdRouter.put("/:id", validateBody(updateRuleSchema), async (req, res) => {
  const rule = await findRuleOr404(String(req.params.id ?? ""));
  await assertRuleWritable(rule, req.auth!.userId, "sửa");

  // Giá trị gộp (body ?? hiện có) — validate cross-field trên giá trị sau gộp
  const body = req.body;
  const merged = {
    categoryId: body.categoryId ?? rule.categoryId,
    amount: body.amount ?? rule.amount,
    note: body.note !== undefined ? body.note : rule.note,
    startDate: body.startDate ?? rule.startDate,
    endType: (body.endType ?? rule.endType) as RecurringEndType,
    endDate: body.endDate !== undefined ? body.endDate : rule.endDate,
    occurrenceCount: body.occurrenceCount !== undefined ? body.occurrenceCount : rule.occurrenceCount,
  };
  const today = todayStr();
  if (merged.categoryId !== rule.categoryId) {
    await assertCategoryInFamily(rule.familyId, merged.categoryId);
  }
  assertEndConditions(merged.startDate, merged.endType, merged.endDate, merged.occurrenceCount, today);

  // Tính lại nextDate sau khi sửa (spec §3.1) — kể cả rule đã hoàn tất
  // (sửa xong có thể active trở lại). Anchor luôn theo "Từ" MỚI.
  const lastGenerated = await prisma.expense.findFirst({
    where: { recurringRuleId: rule.id },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  let nextDate: string | null = lastGenerated
    ? nextOccurrence(anchorDayOf(merged.startDate), lastGenerated.date)
    : firstOccurrenceFrom(merged.startDate, today);

  // Hoàn tất ngay: kỳ kế tiếp đã vượt điều kiện kết thúc
  // (VD user giảm số lần xuống dưới số đã sinh)
  const countExhausted =
    merged.endType === "COUNT" &&
    merged.occurrenceCount != null &&
    rule.generatedCount >= merged.occurrenceCount;
  if ((merged.endType === "UNTIL_DATE" && merged.endDate != null && nextDate > merged.endDate) ||
    countExhausted) {
    nextDate = null;
  }

  const updated = await prisma.recurringRule.update({
    where: { id: rule.id },
    data: {
      categoryId: merged.categoryId,
      amount: merged.amount,
      note: merged.note,
      startDate: merged.startDate,
      endType: merged.endType,
      endDate: merged.endDate,
      occurrenceCount: merged.occurrenceCount,
      nextDate,
      completedAt: nextDate === null ? new Date() : null,
    },
    include: { category: true },
  });
  sendOk(res, { rule: toRuleDto(updated) });
});

recurringByIdRouter.delete("/:id", async (req, res) => {
  const rule = await findRuleOr404(String(req.params.id ?? ""));
  await assertRuleWritable(rule, req.auth!.userId, "xoá");
  // Khoản đã sinh GIỮ LẠI (Expense.recurringRuleId → SetNull)
  await prisma.recurringRule.delete({ where: { id: rule.id } });
  sendOk(res, { ok: true });
});
