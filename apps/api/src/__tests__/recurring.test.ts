import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import {
  anchorDayOf,
  firstOccurrenceFrom,
  nextOccurrence,
  occurrenceInMonth,
} from "@expense-tracker/shared";
import { createApp } from "../app.js";
import { todayStr } from "../lib/dates.js";
import { prisma } from "../prisma.js";

// Giao dịch định kỳ — spec: docs/spec-recurring.md §5.2 (case 16–47)
// Postgres thật (expense_tracker_test, reset ở global-setup).

const PASSWORD = "matkhau123";

let app: Express;
let owner: { userId: string; name: string; token: string };
let member: { userId: string; token: string };
let stranger: { userId: string; token: string };
let familyId: string; // family chính — nơi tạo rule
let otherFamilyId: string; // family 2 — test "category của family khác"
let otherCategoryId: string; // 1 preset của family 2
let categoryId: string; // preset "Ăn uống" của family 1
let inviteCode: string;
let TODAY: string;
let VALID: Record<string, unknown>;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function register(name: string, username: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name, username, password: PASSWORD });
  expect(res.status).toBe(201);
  return { userId: res.body.data.user.id, name, token: res.body.data.accessToken };
}

const getRules = (token: string, family: string) =>
  request(app).get(`/api/families/${family}/recurring`).set(auth(token));

const postRule = (token: string, family: string, body: object) =>
  request(app).post(`/api/families/${family}/recurring`).set(auth(token)).send(body);

const materialize = (token: string, family: string) =>
  request(app)
    .post(`/api/families/${family}/recurring/materialize`)
    .set(auth(token))
    .send({});

const getRule = (token: string, id: string) =>
  request(app).get(`/api/recurring/${id}`).set(auth(token));

const putRule = (token: string, id: string, body: object) =>
  request(app).put(`/api/recurring/${id}`).set(auth(token)).send(body);

const deleteRule = (token: string, id: string) =>
  request(app).delete(`/api/recurring/${id}`).set(auth(token));

let TY = 2026;
let TM = 1;
let TD = 1;

function daysAgo(n: number): string {
  const d = new Date(Date.UTC(TY, TM - 1, TD - n));
  return d.toISOString().slice(0, 10);
}

function daysAhead(n: number): string {
  const d = new Date(Date.UTC(TY, TM - 1, TD + n));
  return d.toISOString().slice(0, 10);
}

/** Kỳ của tháng cách `date` lùi `steps` tháng (anchor = ngày của date). */
function prevOccurrence(date: string, steps: number): string {
  let d = date;
  for (let i = 0; i < steps; i += 1) {
    const [y, m] = d.split("-").map(Number);
    d = occurrenceInMonth(anchorDayOf(d), m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
  }
  return d;
}

/**
 * Materialize là tick CẢ family — để test đo đúng 1 rule mục tiêu, lùi mọi
 * rule khác (trừ exceptId) về nextDate 2099 (không bao giờ do tại today).
 */
async function silenceAllRules(exceptId?: string): Promise<void> {
  await prisma.recurringRule.updateMany({
    where: {
      familyId,
      nextDate: { not: null },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { nextDate: "2099-12-31" },
  });
}

beforeAll(async () => {
  app = createApp();
  TODAY = todayStr();
  [TY, TM, TD] = TODAY.split("-").map(Number);

  owner = await register("Chủ Định Kỳ", "rec_owner");
  const fam = await request(app)
    .post("/api/families")
    .set(auth(owner.token))
    .send({ name: "Gia Định Kỳ" });
  familyId = fam.body.data.family.id;
  inviteCode = fam.body.data.family.inviteCode;

  const fam2 = await request(app)
    .post("/api/families")
    .set(auth(owner.token))
    .send({ name: "Gia Định Kỳ 2" });
  otherFamilyId = fam2.body.data.family.id;
  const cats2 = await request(app)
    .get(`/api/families/${otherFamilyId}/categories`)
    .set(auth(owner.token));
  otherCategoryId = cats2.body.data.categories[0].id;

  member = await register("Member Định Kỳ", "rec_member");
  await request(app)
    .post("/api/families/join")
    .set(auth(member.token))
    .send({ code: inviteCode });

  stranger = await register("Lạ Mặt", "rec_stranger");

  const cats = await request(app)
    .get(`/api/families/${familyId}/categories`)
    .set(auth(owner.token));
  const cat = cats.body.data.categories.find((c: { name: string }) => c.name === "Ăn uống");
  expect(cat, "preset 'Ăn uống' phải được seed khi tạo family").toBeTruthy();
  categoryId = cat.id;

  VALID = { categoryId, amount: 1_500_000, note: "Tiền điện", startDate: TODAY, endType: "FOREVER" };
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// GET /api/families/:id/recurring
// ---------------------------------------------------------------------------

describe("GET /api/families/:id/recurring", () => {
  it("#16 family mới chưa có rule → 200, rules: []", async () => {
    const res = await getRules(owner.token, familyId);
    expect(res.status).toBe(200);
    expect(res.body.data.rules).toEqual([]);
  });

  it("#19 (GET) user không phải member → 403 NOT_FAMILY_MEMBER", async () => {
    const res = await getRules(stranger.token, familyId);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_FAMILY_MEMBER");
  });
});

// ---------------------------------------------------------------------------
// POST /api/families/:id/recurring
// ---------------------------------------------------------------------------

describe("POST /api/families/:id/recurring", () => {
  it("#17 OWNER: FOREVER startDate=today → 201, DB đúng nextDate/frequency/generatedCount", async () => {
    const res = await postRule(owner.token, familyId, VALID);
    expect(res.status).toBe(201);
    const rule = res.body.data.rule;
    expect(rule).toMatchObject({
      amount: 1_500_000,
      note: "Tiền điện",
      frequency: "MONTHLY",
      startDate: TODAY,
      endType: "FOREVER",
      endDate: null,
      occurrenceCount: null,
      nextDate: TODAY,
      generatedCount: 0,
      completedAt: null,
    });
    expect(rule.category).toMatchObject({ id: categoryId, name: "Ăn uống" });

    // DB trực tiếp (spec: nextDate = today, frequency "MONTHLY", generatedCount 0)
    const row = await prisma.recurringRule.findUnique({ where: { id: rule.id } });
    expect(row?.frequency).toBe("MONTHLY");
    expect(row?.nextDate).toBe(TODAY);
    expect(row?.generatedCount).toBe(0);
  });

  it("#18 MEMBER → 403 OWNER_ONLY", async () => {
    const res = await postRule(member.token, familyId, VALID);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OWNER_ONLY");
  });

  it("#19 (POST) user không phải member → 403 NOT_FAMILY_MEMBER", async () => {
    const res = await postRule(stranger.token, familyId, VALID);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_FAMILY_MEMBER");
  });

  it.each([
    [{ amount: 0 }, /amount/],
    [{ amount: 1.5 }, /amount/],
    [{ amount: 1_000_000_000_001 }, /amount/],
    [{ note: "x".repeat(201) }, /note/],
    [{ startDate: "2026-13-01" }, /startDate/],
    [{ endType: "UNTIL_DATE" }, /endDate/],
    [{ endType: "COUNT" }, /occurrenceCount/],
    [{ endType: "FOREVER", endDate: "2026-12-31" }, /FOREVER/],
  ])("#20 sai validate %j → 400 VALIDATION_ERROR (message đúng field sai)", async (patch, fieldRe) => {
    const res = await postRule(owner.token, familyId, { ...VALID, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(fieldRe);
  });

  it("#21 UNTIL_DATE endDate < kỳ đầu tiên → 400 VALIDATION_ERROR", async () => {
    const res = await postRule(owner.token, familyId, {
      ...VALID,
      endType: "UNTIL_DATE",
      endDate: daysAgo(1),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("#22 categoryId thuộc family khác → 404 CATEGORY_NOT_FOUND", async () => {
    const res = await postRule(owner.token, familyId, { ...VALID, categoryId: otherCategoryId });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CATEGORY_NOT_FOUND");
  });

  it("#23 startDate quá khứ (−40 ngày) → nextDate = kỳ đầu tiên ≥ today", async () => {
    const start = daysAgo(40);
    const res = await postRule(owner.token, familyId, { ...VALID, startDate: start });
    expect(res.status).toBe(201);
    const expected = firstOccurrenceFrom(start, TODAY);
    expect(res.body.data.rule.nextDate).toBe(expected);
    expect(expected >= TODAY).toBe(true); // so lexicographic — đúng thứ tự YYYY-MM-DD
    expect(expected).not.toBe(start); // không sinh bù quá khứ
  });
});

// ---------------------------------------------------------------------------
// POST /api/families/:id/recurring/materialize
// ---------------------------------------------------------------------------

describe("POST /api/families/:id/recurring/materialize", () => {
  it("#24 MEMBER gọi, rule nextDate=today → count 1, khoản đúng, rule tiến +1 tháng", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    expect(rule.nextDate).toBe(TODAY);
    await silenceAllRules(rule.id);

    const res = await materialize(member.token, familyId);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(1);
    expect(res.body.data.created).toEqual([
      { expenseId: expect.any(String), date: TODAY, month: TODAY.slice(0, 7) },
    ]);

    // Khoản sinh ra: thuộc tính = rule, userId = người setup (KHÔNG phải member gọi)
    const expenseId = res.body.data.created[0].expenseId;
    const row = await prisma.expense.findUnique({ where: { id: expenseId } });
    expect(row).toMatchObject({
      familyId,
      userId: owner.userId,
      categoryId,
      amount: 1_500_000,
      note: "Tiền điện",
      date: TODAY,
      recurringRuleId: rule.id,
    });

    const updated = await prisma.recurringRule.findUnique({ where: { id: rule.id } });
    expect(updated?.nextDate).toBe(nextOccurrence(anchorDayOf(TODAY), TODAY));
    expect(updated?.generatedCount).toBe(1);
    expect(updated?.completedAt).toBeNull();
  });

  it("#25 materialize lần 2 ngay sau → count 0 (không sinh trùng)", async () => {
    await silenceAllRules();
    const res = await materialize(owner.token, familyId);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
    expect(res.body.data.created).toEqual([]);
  });

  it("#26 2 materialize song song → tổng count = 1 (row lock + re-read)", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    await silenceAllRules(rule.id);

    const [a, b] = await Promise.all([materialize(owner.token, familyId), materialize(member.token, familyId)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.data.count + b.body.data.count).toBe(1);

    const count = await prisma.expense.count({ where: { recurringRuleId: rule.id } });
    expect(count).toBe(1);
    const updated = await prisma.recurringRule.findUnique({ where: { id: rule.id } });
    expect(updated?.generatedCount).toBe(1);
  });

  it("#27 rule nextDate trong tương lai → count 0, nextDate không đổi", async () => {
    const future = nextOccurrence(anchorDayOf(TODAY), TODAY); // +1 tháng
    const rule = (await postRule(owner.token, familyId, { ...VALID, startDate: future })).body.data.rule;
    expect(rule.nextDate).toBe(future);
    await silenceAllRules(rule.id);

    const res = await materialize(owner.token, familyId);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
    const row = await prisma.recurringRule.findUnique({ where: { id: rule.id } });
    expect(row?.nextDate).toBe(future);
  });

  it("#28 rule quá hạn 2 tháng → count 3 (2 kỳ trước + hôm nay), nextDate = tháng tới", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    await prisma.recurringRule.update({
      where: { id: rule.id },
      data: { nextDate: prevOccurrence(TODAY, 2) },
    });
    await silenceAllRules(rule.id);

    const res = await materialize(owner.token, familyId);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(3);
    expect(res.body.data.created.map((c: { date: string }) => c.date)).toEqual([
      prevOccurrence(TODAY, 2),
      prevOccurrence(TODAY, 1),
      TODAY,
    ]);

    const expenses = await prisma.expense.findMany({ where: { recurringRuleId: rule.id } });
    expect(expenses).toHaveLength(3);
    const row = await prisma.recurringRule.findUnique({ where: { id: rule.id } });
    expect(row?.nextDate).toBe(nextOccurrence(anchorDayOf(TODAY), TODAY));
    expect(row?.generatedCount).toBe(3);
  });

  it("#29 COUNT = 1 → sinh 1 rồi hoàn tất; materialize lần 2 → count 0", async () => {
    const rule = (
      await postRule(owner.token, familyId, { ...VALID, endType: "COUNT", occurrenceCount: 1 })
    ).body.data.rule;
    await silenceAllRules(rule.id);

    const res = await materialize(owner.token, familyId);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(1);
    const row = await prisma.recurringRule.findUnique({ where: { id: rule.id } });
    expect(row?.nextDate).toBeNull();
    expect(row?.completedAt).not.toBeNull();
    expect(row?.generatedCount).toBe(1);

    const res2 = await materialize(owner.token, familyId);
    expect(res2.status).toBe(200);
    expect(res2.body.data.count).toBe(0);
  });

  it("#30 UNTIL_DATE endDate = today → sinh 1 rồi hoàn tất", async () => {
    const rule = (
      await postRule(owner.token, familyId, { ...VALID, endType: "UNTIL_DATE", endDate: TODAY })
    ).body.data.rule;
    await silenceAllRules(rule.id);

    const res = await materialize(owner.token, familyId);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(1);
    const row = await prisma.recurringRule.findUnique({ where: { id: rule.id } });
    expect(row?.nextDate).toBeNull();
    expect(row?.completedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GET /api/recurring/:id
// ---------------------------------------------------------------------------

describe("GET /api/recurring/:id", () => {
  it("#31 MEMBER xem rule → 200 + category nested", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    const res = await getRule(member.token, rule.id);
    expect(res.status).toBe(200);
    expect(res.body.data.rule.id).toBe(rule.id);
    expect(res.body.data.rule.category).toMatchObject({ id: categoryId, name: "Ăn uống" });
  });

  it("#32 user không phải member → 403 NOT_FAMILY_MEMBER", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    const res = await getRule(stranger.token, rule.id);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_FAMILY_MEMBER");
  });
});

// ---------------------------------------------------------------------------
// PUT /api/recurring/:id
// ---------------------------------------------------------------------------

describe("PUT /api/recurring/:id", () => {
  it("#33 OWNER đổi amount — khoản ĐÃ sinh không đổi (snapshot tại kỳ sinh)", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    await silenceAllRules(rule.id);
    await materialize(owner.token, familyId); // sinh 1 khoản (date = TODAY)

    const res = await putRule(owner.token, rule.id, { amount: 999_999 });
    expect(res.status).toBe(200);
    expect(res.body.data.rule.amount).toBe(999_999);

    const expenses = await prisma.expense.findMany({ where: { recurringRuleId: rule.id } });
    expect(expenses).toHaveLength(1);
    expect(expenses[0].amount).toBe(1_500_000);
  });

  it("#34 MEMBER → 403 FORBIDDEN", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    const res = await putRule(member.token, rule.id, { amount: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("#35 OWNER khác (không phải người tạo) → 200", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;

    // Seed membership: register + join + nâng role OWNER qua prisma
    const u = await register("Chủ 2", "rec_owner2");
    await request(app)
      .post("/api/families/join")
      .set(auth(u.token))
      .send({ code: inviteCode });
    await prisma.familyMember.update({
      where: { familyId_userId: { familyId, userId: u.userId } },
      data: { role: "OWNER" },
    });

    const res = await putRule(u.token, rule.id, { amount: 777_000 });
    expect(res.status).toBe(200);
    expect(res.body.data.rule.amount).toBe(777_000);
  });

  it("#36 đổi startDate vào tương lai, rule CHƯA có khoản sinh → nextDate = startDate mới", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    const future = daysAhead(10);
    const res = await putRule(owner.token, rule.id, { startDate: future });
    expect(res.status).toBe(200);
    expect(res.body.data.rule.nextDate).toBe(future);
  });

  it("#37 đổi startDate, rule ĐÃ có khoản sinh (D) → nextDate = nextOccurrence(anchor mới, D)", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    await silenceAllRules(rule.id);
    await materialize(owner.token, familyId); // D = TODAY

    const newStart = daysAhead(13);
    const res = await putRule(owner.token, rule.id, { startDate: newStart });
    expect(res.status).toBe(200);
    // Anchor theo "Từ" MỚI — kỳ kế tiếp neo theo anchor mới, sau D
    expect(res.body.data.rule.nextDate).toBe(nextOccurrence(anchorDayOf(newStart), TODAY));
  });

  it("#38 UNTIL_DATE endDate < kỳ kế tiếp → hoàn tất ngay", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    await silenceAllRules(rule.id);
    await materialize(owner.token, familyId); // D = TODAY, kỳ kế tiếp = +1 tháng

    const res = await putRule(owner.token, rule.id, { endType: "UNTIL_DATE", endDate: TODAY });
    expect(res.status).toBe(200);
    const r = res.body.data.rule;
    expect(r.nextDate).toBeNull();
    expect(r.completedAt).toBeTruthy();
  });

  it("#39 categoryId thuộc family khác → 404 CATEGORY_NOT_FOUND", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    const res = await putRule(owner.token, rule.id, { categoryId: otherCategoryId });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CATEGORY_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/recurring/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/recurring/:id", () => {
  it("#40 OWNER xoá rule đã sinh 2 khoản → khoản giữ lại, recurringRuleId = null", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    // Lùi nextDate 1 tháng → 1 tick sinh 2 kỳ [tháng trước, hôm nay]
    await prisma.recurringRule.update({
      where: { id: rule.id },
      data: { nextDate: prevOccurrence(TODAY, 1) },
    });
    await silenceAllRules(rule.id);
    const mz = await materialize(owner.token, familyId);
    expect(mz.body.data.count).toBe(2);

    const res = await deleteRule(owner.token, rule.id);
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);

    const gone = await prisma.recurringRule.findUnique({ where: { id: rule.id } });
    expect(gone).toBeNull();
    const expenses = await prisma.expense.findMany({
      where: { id: { in: mz.body.data.created.map((c: { expenseId: string }) => c.expenseId) } },
    });
    expect(expenses).toHaveLength(2);
    for (const row of expenses) {
      expect(row.recurringRuleId).toBeNull();
    }
  });

  it("#41 MEMBER → 403 FORBIDDEN", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    const res = await deleteRule(member.token, rule.id);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("#42 PUT/DELETE rule không tồn tại → 404 RECURRING_RULE_NOT_FOUND", async () => {
    const put = await putRule(owner.token, "rule-khong-ton-tai", { amount: 100 });
    expect(put.status).toBe(404);
    expect(put.body.error.code).toBe("RECURRING_RULE_NOT_FOUND");
    const del = await deleteRule(owner.token, "rule-khong-ton-tai");
    expect(del.status).toBe(404);
    expect(del.body.error.code).toBe("RECURRING_RULE_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// Tương tác với endpoint expenses (4B + 409 P2002)
// ---------------------------------------------------------------------------

describe("Khoản sinh ra × endpoint expenses", () => {
  it("#43 GET list expenses sau materialize → khoản sinh có mặt + dto có recurringRuleId", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    await silenceAllRules(rule.id);
    const mz = await materialize(owner.token, familyId);

    const list = await request(app)
      .get(`/api/families/${familyId}/expenses?month=${TODAY.slice(0, 7)}`)
      .set(auth(owner.token));
    expect(list.status).toBe(200);
    const found = list.body.data.expenses.find((e: { id: string }) => e.id === mz.body.data.created[0].expenseId);
    expect(found).toBeTruthy();
    expect(found.recurringRuleId).toBe(rule.id);
  });

  it("#44 PUT expense (đã sinh) đổi date trùng kỳ khác cùng rule → 409 RECURRING_DATE_CONFLICT", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    await prisma.recurringRule.update({
      where: { id: rule.id },
      data: { nextDate: prevOccurrence(TODAY, 1) },
    });
    await silenceAllRules(rule.id);
    const mz = await materialize(owner.token, familyId); // 2 kỳ: [tháng trước, hôm nay]
    expect(mz.body.data.count).toBe(2);

    const [prevExp, todayExp] = [...mz.body.data.created].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const res = await request(app)
      .put(`/api/expenses/${prevExp.expenseId}`)
      .set(auth(owner.token))
      .send({ date: todayExp.date });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RECURRING_DATE_CONFLICT");
  });

  it("#45 PUT expense (đã sinh) đổi amount/category/note → 200 (4B: sửa như khoản thường)", async () => {
    const rule = (await postRule(owner.token, familyId, VALID)).body.data.rule;
    await silenceAllRules(rule.id);
    const mz = await materialize(owner.token, familyId);
    const exp = mz.body.data.created[0];

    const res = await request(app)
      .put(`/api/expenses/${exp.expenseId}`)
      .set(auth(owner.token))
      .send({ amount: 123_456, note: "đã sửa tay", categoryId });
    expect(res.status).toBe(200);
    expect(res.body.data.expense.amount).toBe(123_456);
    expect(res.body.data.expense.note).toBe("đã sửa tay");
    expect(res.body.data.expense.recurringRuleId).toBe(rule.id);
  });

  it("#46 xoá khoản (rule COUNT) → materialize KHÔNG sinh lại, generatedCount không giảm", async () => {
    const rule = (
      await postRule(owner.token, familyId, {
        categoryId,
        amount: 500_000,
        startDate: TODAY,
        endType: "COUNT",
        occurrenceCount: 2,
      })
    ).body.data.rule;
    await prisma.recurringRule.update({
      where: { id: rule.id },
      data: { nextDate: prevOccurrence(TODAY, 1) },
    });
    await silenceAllRules(rule.id);
    const mz = await materialize(owner.token, familyId);
    expect(mz.body.data.count).toBe(2);

    const del = await request(app)
      .delete(`/api/expenses/${mz.body.data.created[0].expenseId}`)
      .set(auth(owner.token));
    expect(del.status).toBe(200);

    const mz2 = await materialize(owner.token, familyId);
    expect(mz2.body.data.count).toBe(0);
    const row = await prisma.recurringRule.findUnique({ where: { id: rule.id } });
    expect(row?.generatedCount).toBe(2);
    expect(row?.nextDate).toBeNull();
  });
});
