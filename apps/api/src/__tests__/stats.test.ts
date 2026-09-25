import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { createApp } from "../app.js";
import { prisma } from "../prisma.js";

const PASSWORD = "matkhau123";

let app: Express;
let ownerToken: string;
let memberToken: string;
let member2Token: string;
let member2UserId: string;
let strangerToken: string;
let familyId: string;
let eatCategoryId: string;
let transportCategoryId: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = createApp();

  const ownerReg = await request(app)
    .post("/api/auth/register")
    .send({ name: "Chủ Stats", username: "stats_owner", password: PASSWORD });
  ownerToken = ownerReg.body.data.accessToken;

  const fam = await request(app)
    .post("/api/families")
    .set(auth(ownerToken))
    .send({ name: "Gia Đình Stats" });
  familyId = fam.body.data.family.id;

  const memberReg = await request(app)
    .post("/api/auth/register")
    .send({ name: "Member Stats", username: "stats_member", password: PASSWORD });
  memberToken = memberReg.body.data.accessToken;
  await request(app)
    .post("/api/families/join")
    .set(auth(memberToken))
    .send({ code: fam.body.data.family.inviteCode });

  const member2Reg = await request(app)
    .post("/api/auth/register")
    .send({ name: "Member 2", username: "stats_member2", password: PASSWORD });
  member2Token = member2Reg.body.data.accessToken;
  member2UserId = member2Reg.body.data.user.id;
  await request(app)
    .post("/api/families/join")
    .set(auth(member2Token))
    .send({ code: fam.body.data.family.inviteCode });

  const strangerReg = await request(app)
    .post("/api/auth/register")
    .send({ name: "Lạ Stats", username: "stats_stranger", password: PASSWORD });
  strangerToken = strangerReg.body.data.accessToken;

  const cats = await request(app)
    .get(`/api/families/${familyId}/categories`)
    .set(auth(ownerToken));
  const list = cats.body.data.categories;
  eatCategoryId = list.find((c: { name: string }) => c.name === "Ăn uống").id;
  transportCategoryId = list.find((c: { name: string }) => c.name === "Đi lại").id;

  // Data cố định (owner): tháng 7 = 0; tháng 8 = 100.000; tháng 9 = 220.000
  // (Ăn uống 120k + Đi lại 100k)
  const fixtures = [
    { categoryId: eatCategoryId, amount: 100000, date: "2026-08-10" },
    { categoryId: eatCategoryId, amount: 100000, date: "2026-09-05" },
    { categoryId: transportCategoryId, amount: 50000, date: "2026-09-10" },
    { categoryId: transportCategoryId, amount: 50000, date: "2026-09-10" },
    { categoryId: eatCategoryId, amount: 20000, date: "2026-09-25" },
  ];
  for (const f of fixtures) {
    const res = await request(app)
      .post("/api/expenses")
      .set(auth(ownerToken))
      .send({ familyId, ...f });
    expect(res.status).toBe(201);
  }

  // Member nhập: tháng 9 +30.000 Đi lại (09-12) → tháng 9 = 250.000
  const memberFix = await request(app)
    .post("/api/expenses")
    .set(auth(memberToken))
    .send({ familyId, categoryId: transportCategoryId, amount: 30000, date: "2026-09-12" });
  expect(memberFix.status).toBe(201);

  // Member2 nhập: tháng 7 +20.000 Ăn uống (07-10) — sau khi bị xoá khỏi family
  // khoản này thành data "orphan" (vẫn tồn tại, người nhập không còn là member)
  const member2Fix = await request(app)
    .post("/api/expenses")
    .set(auth(member2Token))
    .send({ familyId, categoryId: eatCategoryId, amount: 20000, date: "2026-07-10" });
  expect(member2Fix.status).toBe(201);

  // Owner xoá member2: chỉ mất membership, khoản chi tháng 7 giữ nguyên
  const removeRes = await request(app)
    .delete(`/api/families/${familyId}/members/${member2UserId}`)
    .set(auth(ownerToken));
  expect(removeRes.status).toBe(200);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/families/:id/stats?month=2026-09", () => {
  let stats: {
    month: string;
    total: number;
    previousMonthTotal: number;
    byCategory: Array<{ category: { name: string }; total: number; percent: number }>;
    byDay: Array<{ date: string; total: number }>;
    byMember: Array<{ name: string; total: number; percent: number }>;
  };

  beforeAll(async () => {
    const res = await request(app)
      .get(`/api/families/${familyId}/stats?month=2026-09`)
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    stats = res.body.data;
  });

  it("tổng tháng và tổng tháng trước đúng", () => {
    expect(stats.month).toBe("2026-09");
    expect(stats.total).toBe(250000); // 220k (owner) + 30k (member)
    expect(stats.previousMonthTotal).toBe(100000);
  });

  it("byCategory: đúng tổng, percent 1 số thập phân, sort DESC, bỏ danh mục không chi", () => {
    expect(stats.byCategory).toHaveLength(2);
    expect(stats.byCategory[0]).toMatchObject({
      category: { name: "Đi lại" },
      total: 130000,
      percent: 52,
    });
    expect(stats.byCategory[1]).toMatchObject({
      category: { name: "Ăn uống" },
      total: 120000,
      percent: 48,
    });
  });

  it("byDay: đủ 30 ngày tháng 9, ngày có chi đúng tổng (kể trùng ngày), ngày trống = 0", () => {
    expect(stats.byDay).toHaveLength(30);
    expect(stats.byDay[0]).toEqual({ date: "2026-09-01", total: 0 });
    expect(stats.byDay[4].total).toBe(100000); // 09-05
    expect(stats.byDay[9].total).toBe(100000); // 09-10 (2 món 50k gộp)
    expect(stats.byDay[11].total).toBe(30000); // 09-12 (member)
    expect(stats.byDay[24].total).toBe(20000); // 09-25
    expect(stats.byDay[29].total).toBe(0); // 09-30
  });

  it("byMember: đúng tổng + percent từng thành viên, sort DESC, tổng các hàng = total", () => {
    expect(stats.byMember).toEqual([
      { name: "Chủ Stats", total: 220000, percent: 88 },
      { name: "Member Stats", total: 30000, percent: 12 },
    ]);
    expect(stats.byMember.reduce((s, m) => s + m.total, 0)).toBe(stats.total);
  });
});

describe("GET /api/families/:id/stats — các case khác", () => {
  it("tháng 8: total 100k, tháng trước (7) = 20k (khoản orphan), member không chi hiện 0", async () => {
    const res = await request(app)
      .get(`/api/families/${familyId}/stats?month=2026-08`)
      .set(auth(ownerToken));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(100000);
    expect(res.body.data.previousMonthTotal).toBe(20000);
    expect(res.body.data.byCategory).toHaveLength(1);
    expect(res.body.data.byCategory[0].percent).toBe(100);
    expect(res.body.data.byDay).toHaveLength(31);
    expect(res.body.data.byMember).toEqual([
      { name: "Chủ Stats", total: 100000, percent: 100 },
      { name: "Member Stats", total: 0, percent: 0 },
    ]);
    expect(res.body.data.byMember.reduce((s: number, m: { total: number }) => s + m.total, 0)).toBe(
      res.body.data.total,
    );
  });

  it("tháng 7: khoản của thành viên ĐÃ XÓA khỏi family vẫn hiện theo tên (orphan), thành viên hiện tại không chi = 0", async () => {
    const res = await request(app)
      .get(`/api/families/${familyId}/stats?month=2026-07`)
      .set(auth(ownerToken));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(20000);
    expect(res.body.data.byMember).toEqual([
      { name: "Member 2", total: 20000, percent: 100 },
      { name: "Chủ Stats", total: 0, percent: 0 },
      { name: "Member Stats", total: 0, percent: 0 },
    ]);
    expect(res.body.data.byMember.reduce((s: number, m: { total: number }) => s + m.total, 0)).toBe(
      res.body.data.total,
    );
  });

  it("tháng rỗng: total 0, byCategory rỗng, byDay đủ ngày toàn 0, byMember toàn 0", async () => {
    const res = await request(app)
      .get(`/api/families/${familyId}/stats?month=2026-06`)
      .set(auth(ownerToken));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.byCategory).toEqual([]);
    expect(res.body.data.byDay).toHaveLength(30);
    expect(res.body.data.byDay.every((d: { total: number }) => d.total === 0)).toBe(true);
    expect(res.body.data.byMember).toEqual([
      { name: "Chủ Stats", total: 0, percent: 0 },
      { name: "Member Stats", total: 0, percent: 0 },
    ]);
  });

  it("không truyền month → mặc định tháng hiện tại", async () => {
    const res = await request(app).get(`/api/families/${familyId}/stats`).set(auth(memberToken));

    expect(res.status).toBe(200);
    const expected = new Date().toISOString().slice(0, 7);
    expect(res.body.data.month).toBe(expected);
  });

  it("month sai định dạng → 400; người ngoài → 403", async () => {
    const bad = await request(app)
      .get(`/api/families/${familyId}/stats?month=2026-13`)
      .set(auth(ownerToken));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");

    const outside = await request(app)
      .get(`/api/families/${familyId}/stats?month=2026-09`)
      .set(auth(strangerToken));
    expect(outside.status).toBe(403);
    expect(outside.body.error.code).toBe("NOT_FAMILY_MEMBER");
  });
});
