import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { createApp } from "../app.js";
import { prisma } from "../prisma.js";

const PASSWORD = "matkhau123";

let app: Express;
let owner: { userId: string; name: string; token: string };
let member: { userId: string; name: string; token: string };
let stranger: { userId: string; token: string };
let familyId: string; // family chính — có rental config
let familyNoConfigId: string; // family 2 — chưa setup rental
let rentalCategoryId: string; // "Nhà trọ"

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function register(name: string, username: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name, username, password: PASSWORD });
  expect(res.status).toBe(201);
  return { userId: res.body.data.user.id, name, token: res.body.data.accessToken };
}

const putConfig = (actor: { token: string }, family: string, body: object) =>
  request(app).put(`/api/families/${family}/rental/config`).set(auth(actor.token)).send(body);

const getRental = (token: string, family: string) =>
  request(app).get(`/api/families/${family}/rental`).set(auth(token));

const postMonth = (token: string, family: string, month: string) =>
  request(app)
    .post(`/api/families/${family}/rental/months`)
    .set(auth(token))
    .send({ month });

const putMonth = (token: string, family: string, month: string, body: object) =>
  request(app)
    .put(`/api/families/${family}/rental/months/${month}`)
    .set(auth(token))
    .send(body);

const confirmMonth = (token: string, family: string, month: string, body: object) =>
  request(app)
    .post(`/api/families/${family}/rental/months/${month}/confirm`)
    .set(auth(token))
    .send(body);

const deleteMonth = (token: string, family: string, month: string) =>
  request(app).delete(`/api/families/${family}/rental/months/${month}`).set(auth(token));

// Data thật tháng 7 (sổ sách gia đình)
const CONFIG = {
  rent: 3_200_000,
  internet: 100_000,
  elevator: 200_000,
  parking: 100_000,
  electricityRate: 4_000,
  waterRate: 35_000,
};
const JULY_CONFIRM = {
  ...CONFIG,
  oldElec: 17_743,
  newElec: 18_023,
  oldWater: 1_001,
  newWater: 1_007,
  date: "2026-07-01",
};

beforeAll(async () => {
  app = createApp();

  owner = await register("Chủ Trọ", "rental_owner");
  const fam = await request(app)
    .post("/api/families")
    .set(auth(owner.token))
    .send({ name: "Gia Đình Trọ" });
  familyId = fam.body.data.family.id;

  const fam2 = await request(app)
    .post("/api/families")
    .set(auth(owner.token))
    .send({ name: "Gia Đình Trọ 2" });
  familyNoConfigId = fam2.body.data.family.id;

  member = await register("Member Trọ", "rental_member");
  await request(app)
    .post("/api/families/join")
    .set(auth(member.token))
    .send({ code: fam.body.data.family.inviteCode });

  stranger = await register("Người Lạ Trọ", "rental_stranger");

  const cats = await request(app)
    .get(`/api/families/${familyId}/categories`)
    .set(auth(owner.token));
  const cat = cats.body.data.categories.find((c: { name: string }) => c.name === "Nhà trọ");
  expect(cat, "preset 'Nhà trọ' phải được seed khi tạo family").toBeTruthy();
  rentalCategoryId = cat.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// GET /rental (trạng thái ban đầu + phân quyền)
// ---------------------------------------------------------------------------

describe("GET /api/families/:id/rental", () => {
  it("family mới chưa setup: config null, months rỗng", async () => {
    const res = await getRental(owner.token, familyId);
    expect(res.status).toBe(200);
    expect(res.body.data.config).toBeNull();
    expect(res.body.data.months).toEqual([]);
  });

  it("người ngoài family → 403 NOT_FAMILY_MEMBER", async () => {
    const res = await getRental(stranger.token, familyId);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_FAMILY_MEMBER");
  });
});

// ---------------------------------------------------------------------------
// PUT /rental/config
// ---------------------------------------------------------------------------

describe("PUT /api/families/:id/rental/config", () => {
  it("OWNER create lần đầu → 200, config đúng 6 giá trị", async () => {
    const res = await putConfig(owner, familyId, CONFIG);
    expect(res.status).toBe(200);
    expect(res.body.data.config).toMatchObject(CONFIG);
    expect(res.body.data.config.updatedAt).toBeTruthy();
  });

  it("OWNER update (đổi giá điện) → 200, không tạo record thứ 2", async () => {
    const res = await putConfig(owner, familyId, { ...CONFIG, electricityRate: 3_500 });
    expect(res.status).toBe(200);
    expect(res.body.data.config.electricityRate).toBe(3_500);
    expect(res.body.data.config.rent).toBe(CONFIG.rent);

    const count = await prisma.rentalConfig.count({ where: { familyId } });
    expect(count).toBe(1);

    // Trả lại giá trị gốc cho các test sau
    await putConfig(owner, familyId, CONFIG);
  });

  it("MEMBER → 403 OWNER_ONLY", async () => {
    const res = await putConfig(member, familyId, CONFIG);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OWNER_ONLY");
  });

  it.each([
    { ...CONFIG, rent: -1 },
    { ...CONFIG, rent: 1.5 },
    { ...CONFIG, rent: 1_000_000_001 },
    { ...CONFIG, electricityRate: 10_000_001 },
  ])("giá trị không hợp lệ → 400 VALIDATION_ERROR", async (body) => {
    const res = await putConfig(owner, familyId, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// POST /rental/months — tạo draft
// ---------------------------------------------------------------------------

describe("POST /api/families/:id/rental/months", () => {
  it("chưa có config → 409 RENTAL_CONFIG_NOT_SET", async () => {
    const res = await postMonth(owner.token, familyNoConfigId, "2026-07");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RENTAL_CONFIG_NOT_SET");
  });

  it("tạo draft 2026-07: prefill từ config, old/new công tơ = 0, DRAFT", async () => {
    const res = await postMonth(owner.token, familyId, "2026-07");
    expect(res.status).toBe(201);
    const m = res.body.data.month;
    expect(m).toMatchObject({
      month: "2026-07",
      status: "DRAFT",
      expenseId: null,
      confirmedAt: null,
      rent: CONFIG.rent,
      internet: CONFIG.internet,
      elevator: CONFIG.elevator,
      parking: CONFIG.parking,
      electricityRate: CONFIG.electricityRate,
      waterRate: CONFIG.waterRate,
      oldElec: 0,
      newElec: 0,
      oldWater: 0,
      newWater: 0,
    });
    expect(m.total).toBe(CONFIG.rent + CONFIG.internet + CONFIG.elevator + CONFIG.parking);
  });

  it.each(["2026-13", "2026-7", "2026-00", "abc"])("month %s → 400 VALIDATION_ERROR", async (month) => {
    const res = await postMonth(owner.token, familyId, month);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("trùng tháng → 409 RENTAL_MONTH_EXISTS", async () => {
    const res = await postMonth(owner.token, familyId, "2026-07");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RENTAL_MONTH_EXISTS");
  });

  it("mang số công tơ: old của tháng mới = new của tháng trước", async () => {
    await putMonth(owner.token, familyId, "2026-07", { newElec: 18_023, newWater: 1_007 });

    const res = await postMonth(owner.token, familyId, "2026-08");
    expect(res.status).toBe(201);
    const m = res.body.data.month;
    expect(m.oldElec).toBe(18_023);
    expect(m.newElec).toBe(18_023);
    expect(m.oldWater).toBe(1_007);
    expect(m.newWater).toBe(1_007);
  });
});

// ---------------------------------------------------------------------------
// PUT /rental/months/:month — sửa draft
// ---------------------------------------------------------------------------

describe("PUT /api/families/:id/rental/months/:month", () => {
  it("gửi 1 field → cập nhật field đó, các field khác giữ nguyên", async () => {
    const res = await putMonth(owner.token, familyId, "2026-08", { newElec: 19_000 });
    expect(res.status).toBe(200);
    const m = res.body.data.month;
    expect(m.newElec).toBe(19_000);
    expect(m.oldElec).toBe(18_023);
    expect(m.rent).toBe(CONFIG.rent);
    expect(m.elecConsumption).toBe(977);
    expect(m.electricityCost).toBe(977 * CONFIG.electricityRate);
  });

  it("công tơ mới < cũ (cả 2 field cùng gửi) → 400", async () => {
    const res = await putMonth(owner.token, familyId, "2026-08", { oldElec: 19_000, newElec: 18_000 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("công tơ mới < cũ (chỉ gửi new — so với old trong DB) → 400", async () => {
    const res = await putMonth(owner.token, familyId, "2026-08", { newElec: 17_000 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("công tơ nước mới < cũ trong DB → 400", async () => {
    const res = await putMonth(owner.token, familyId, "2026-08", { newWater: 1_000 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("MEMBER → 403 OWNER_ONLY", async () => {
    const res = await putMonth(member.token, familyId, "2026-08", { newElec: 19_500 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OWNER_ONLY");
  });

  it("tháng không tồn tại → 404 MONTH_NOT_FOUND", async () => {
    const res = await putMonth(owner.token, familyId, "2026-03", { newElec: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("MONTH_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// POST /rental/months/:month/confirm — chốt
// ---------------------------------------------------------------------------

describe("POST /api/families/:id/rental/months/:month/confirm", () => {
  it("chốt tháng DRAFT (data thật tháng 7): tạo Expense + CONFIRMED", async () => {
    const res = await confirmMonth(owner.token, familyId, "2026-07", JULY_CONFIRM);
    expect(res.status).toBe(200);
    const { month, expenseId } = res.body.data;
    expect(expenseId).toBeTruthy();
    expect(month.status).toBe("CONFIRMED");
    expect(month.confirmedAt).toBeTruthy();
    expect(month.total).toBe(4_930_000);

    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    expect(expense).toMatchObject({
      familyId,
      userId: owner.userId,
      categoryId: rentalCategoryId,
      amount: 4_930_000,
      date: "2026-07-01",
    });
    expect(expense!.note).toBe(
      "Phòng trọ 07/2026: phòng 3.200.000 + mạng 100.000 + thang máy 200.000 + xe 100.000" +
        " + điện 280 kWh (1.120.000) + nước 6 m³ (210.000)",
    );
  });

  it("GET /rental sau chốt: month có computed fields + expenseId", async () => {
    const res = await getRental(owner.token, familyId);
    const m = res.body.data.months.find((x: { month: string }) => x.month === "2026-07");
    expect(m).toMatchObject({
      status: "CONFIRMED",
      elecConsumption: 280,
      waterConsumption: 6,
      electricityCost: 1_120_000,
      waterCost: 210_000,
      total: 4_930_000,
    });
    expect(m.expenseId).toBeTruthy();
  });

  it("khoản chi hiện trong list expenses theo tháng", async () => {
    const res = await request(app)
      .get(`/api/families/${familyId}/expenses?month=2026-07`)
      .set(auth(owner.token));
    expect(res.status).toBe(200);
    const expense = res.body.data.expenses.find(
      (e: { category: { name: string } }) => e.category.name === "Nhà trọ",
    );
    expect(expense).toMatchObject({ amount: 4_930_000, date: "2026-07-01" });
  });

  it("PUT tháng đã chốt → 409 RENTAL_MONTH_CONFIRMED", async () => {
    const res = await putMonth(owner.token, familyId, "2026-07", { newElec: 18_100 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RENTAL_MONTH_CONFIRMED");
  });

  it("re-chốt tháng CONFIRMED: CÙNG expenseId, amount/note/date cập nhật, không sinh khoản mới", async () => {
    const before = await prisma.expense.count({ where: { familyId } });

    // 18.074 − 17.743 = 331 kWh × 4.000 = 1.324.000 → total 5.134.000
    const res = await confirmMonth(owner.token, familyId, "2026-07", {
      ...JULY_CONFIRM,
      newElec: 18_074,
      date: "2026-07-05",
    });
    expect(res.status).toBe(200);

    const after = await prisma.expense.count({ where: { familyId } });
    expect(after).toBe(before); // không sinh khoản mới

    const month = await prisma.rentalMonth.findUnique({
      where: { familyId_month: { familyId, month: "2026-07" } },
    });
    expect(month!.expenseId).toBe(res.body.data.expenseId);

    const expense = await prisma.expense.findUnique({ where: { id: res.body.data.expenseId } });
    expect(expense!.amount).toBe(5_134_000);
    expect(expense!.date).toBe("2026-07-05");
    expect(expense!.note).toContain("điện 331 kWh (1.324.000)");
  });

  it("date ngoài tháng / ngày không tồn tại → 400", async () => {
    // date thuộc tháng khác với month
    const res1 = await confirmMonth(owner.token, familyId, "2026-08", { ...JULY_CONFIRM, date: "2026-07-15" });
    expect(res1.status).toBe(400);
    expect(res1.body.error.code).toBe("VALIDATION_ERROR");

    // ngày không tồn tại thật (31/02) — validate chạy trước kiểm tra tồn tại tháng
    const res2 = await confirmMonth(owner.token, familyId, "2026-02", { ...JULY_CONFIRM, date: "2026-02-31" });
    expect(res2.status).toBe(400);
  });

  it("tháng không tồn tại → 404 MONTH_NOT_FOUND", async () => {
    // date phải hợp lệ trong chính tháng đó để validation qua, còn tháng thì không tồn tại
    const res = await confirmMonth(owner.token, familyId, "2026-05", {
      ...JULY_CONFIRM,
      date: "2026-05-15",
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("MONTH_NOT_FOUND");
  });

  it.each([
    { ...JULY_CONFIRM, newElec: 17_000 },
    { ...JULY_CONFIRM, newWater: 999 },
  ])("công tơ mới < cũ → 400", async (body) => {
    const res = await confirmMonth(owner.token, familyId, "2026-08", body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// Guard: expense do chốt trọ không sửa/xoá được từ endpoint expenses thường
// ---------------------------------------------------------------------------

describe("Expense đã link tháng trọ (RENTAL_EXPENSE_LOCKED)", () => {
  it("PUT /api/expenses/:id → 409", async () => {
    const expenseId = (
      await prisma.rentalMonth.findUnique({ where: { familyId_month: { familyId, month: "2026-07" } } })
    )!.expenseId!;
    const res = await request(app)
      .put(`/api/expenses/${expenseId}`)
      .set(auth(owner.token))
      .send({ amount: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RENTAL_EXPENSE_LOCKED");
  });

  it("DELETE /api/expenses/:id → 409", async () => {
    const expenseId = (
      await prisma.rentalMonth.findUnique({ where: { familyId_month: { familyId, month: "2026-07" } } })
    )!.expenseId!;
    const res = await request(app).delete(`/api/expenses/${expenseId}`).set(auth(owner.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RENTAL_EXPENSE_LOCKED");
  });
});

// ---------------------------------------------------------------------------
// Self-heal category + xoá tháng
// ---------------------------------------------------------------------------

describe("Xử lý category + xoá tháng", () => {
  it("xoá category 'Nhà trọ' rồi chốt → tự tạo lại category, expense link đúng", async () => {
    // Dùng familyNoConfigId để không vướng guard CATEGORY_IN_USE
    // (family chính đang có expense 2026-07 gắn category 'Nhà trọ').
    await putConfig(owner, familyNoConfigId, CONFIG);
    await postMonth(owner.token, familyNoConfigId, "2026-08");

    const cats = await request(app)
      .get(`/api/families/${familyNoConfigId}/categories`)
      .set(auth(owner.token));
    const catId = cats.body.data.categories.find((c: { name: string }) => c.name === "Nhà trọ").id;
    const delCat = await request(app)
      .delete(`/api/families/${familyNoConfigId}/categories/${catId}`)
      .set(auth(owner.token));
    expect(delCat.status).toBe(200);

    // 19.000 − 18.023 = 977 kWh × 4.000 = 3.908.000; 7 m³ × 35.000 = 245.000
    const res = await confirmMonth(owner.token, familyNoConfigId, "2026-08", {
      ...JULY_CONFIRM,
      oldElec: 18_023,
      newElec: 19_000,
      oldWater: 1_007,
      newWater: 1_014,
      date: "2026-08-01",
    });
    expect(res.status).toBe(200);

    const expense = await prisma.expense.findUnique({ where: { id: res.body.data.expenseId } });
    expect(expense!.amount).toBe(3_600_000 + 3_908_000 + 245_000);
    expect(expense!.familyId).toBe(familyNoConfigId);
    const category = await prisma.category.findUnique({ where: { id: expense!.categoryId } });
    expect(category).toMatchObject({ name: "Nhà trọ", isPreset: true });
  });

  it("xoá tháng DRAFT → 200, tháng biến mất", async () => {
    await postMonth(owner.token, familyId, "2026-01");
    const res = await deleteMonth(owner.token, familyId, "2026-01");
    expect(res.status).toBe(200);

    const list = await getRental(owner.token, familyId);
    expect(list.body.data.months.some((m: { month: string }) => m.month === "2026-01")).toBe(false);
  });

  it("xoá tháng CONFIRMED → xoá luôn expense liên kết", async () => {
    // 2026-08 đang DRAFT (oldElec 18.023, newElec 19.000, oldWater 1.007) — chốt trước
    await putMonth(owner.token, familyId, "2026-08", { newWater: 1_014 });
    const confirm = await confirmMonth(owner.token, familyId, "2026-08", {
      ...JULY_CONFIRM,
      oldElec: 18_023,
      newElec: 19_000,
      oldWater: 1_007,
      newWater: 1_014,
      date: "2026-08-01",
    });
    expect(confirm.status).toBe(200);
    const expenseId = confirm.body.data.expenseId;

    const res = await deleteMonth(owner.token, familyId, "2026-08");
    expect(res.status).toBe(200);

    expect(await prisma.expense.findUnique({ where: { id: expenseId } })).toBeNull();
    const list = await getRental(owner.token, familyId);
    expect(list.body.data.months.some((m: { month: string }) => m.month === "2026-08")).toBe(false);
  });

  it("xoá tháng không tồn tại → 404", async () => {
    const res = await deleteMonth(owner.token, familyId, "2026-06");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("MONTH_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// GET /months — filter theo năm
// ---------------------------------------------------------------------------

describe("GET /api/families/:id/rental/months", () => {
  it("year=YYYY chỉ trả tháng trong năm, desc; không param trả hết", async () => {
    await postMonth(owner.token, familyId, "2025-12");
    await postMonth(owner.token, familyId, "2026-02");

    const byYear = await request(app)
      .get(`/api/families/${familyId}/rental/months?year=2026`)
      .set(auth(owner.token));
    expect(byYear.status).toBe(200);
    const months2026 = byYear.body.data.months.map((m: { month: string }) => m.month);
    expect(months2026).not.toContain("2025-12");
    expect(months2026).toContain("2026-07");
    expect(months2026).toContain("2026-02");
    // desc (YYYY-MM so lexicographic = so thời gian)
    for (let i = 1; i < months2026.length; i++) {
      expect(months2026[i - 1] > months2026[i]).toBe(true);
    }

    const all = await request(app)
      .get(`/api/families/${familyId}/rental/months`)
      .set(auth(owner.token));
    const allMonths = all.body.data.months.map((m: { month: string }) => m.month);
    expect(allMonths).toContain("2025-12");
    expect(allMonths[0]).toBe("2026-07");

    // Dọn 2 tháng phụ
    await deleteMonth(owner.token, familyId, "2025-12");
    await deleteMonth(owner.token, familyId, "2026-02");
  });

  it("year sai format → 400", async () => {
    const res = await request(app)
      .get(`/api/families/${familyId}/rental/months?year=202`)
      .set(auth(owner.token));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
