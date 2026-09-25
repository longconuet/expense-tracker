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
let familyId: string;
let eatCategoryId: string; // "Ăn uống"

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function register(name: string, username: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name, username, password: PASSWORD });
  expect(res.status).toBe(201);
  return { userId: res.body.data.user.id, name, token: res.body.data.accessToken };
}

async function createExpense(
  actor: { token: string },
  data: { familyId: string; categoryId: string; amount: number; date: string; note?: string },
) {
  return request(app).post("/api/expenses").set(auth(actor.token)).send(data);
}

beforeAll(async () => {
  app = createApp();

  owner = await register("Chủ Exp", "exp_owner");
  const fam = await request(app)
    .post("/api/families")
    .set(auth(owner.token))
    .send({ name: "Gia Đình Exp" });
  familyId = fam.body.data.family.id;

  member = await register("Member Exp", "exp_member");
  await request(app)
    .post("/api/families/join")
    .set(auth(member.token))
    .send({ code: fam.body.data.family.inviteCode });

  stranger = await register("Người Lạ Exp", "exp_stranger");

  const cats = await request(app)
    .get(`/api/families/${familyId}/categories`)
    .set(auth(owner.token));
  eatCategoryId = cats.body.data.categories.find((c: { name: string }) => c.name === "Ăn uống").id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/expenses", () => {
  it("member tạo khoản chi: gắn createdByName đúng người nhập", async () => {
    const res = await createExpense(member, {
      familyId,
      categoryId: eatCategoryId,
      amount: 45000,
      date: "2026-09-22",
      note: "Cơm trưa",
    });

    expect(res.status).toBe(201);
    const expense = res.body.data.expense;
    expect(expense).toMatchObject({
      amount: 45000,
      date: "2026-09-22",
      note: "Cơm trưa",
      createdByName: "Member Exp",
    });
    expect(expense.category).toMatchObject({ name: "Ăn uống", icon: "🍜" });
    expect(expense.createdAt).toBeTruthy();
  });

  it("người ngoài family → 403", async () => {
    const res = await createExpense(stranger, {
      familyId,
      categoryId: eatCategoryId,
      amount: 1000,
      date: "2026-09-22",
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_FAMILY_MEMBER");
  });

  it("categoryId không thuộc family → 404", async () => {
    const res = await createExpense(member, {
      familyId,
      categoryId: "khong-ton-tai",
      amount: 1000,
      date: "2026-09-22",
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CATEGORY_NOT_FOUND");
  });

  it.each([
    [0, "bằng 0"],
    [-5, "âm"],
    [1.5, "thập phân"],
  ])("amount %s → 400 VALIDATION_ERROR", async (amount) => {
    const res = await createExpense(member, {
      familyId,
      categoryId: eatCategoryId,
      amount,
      date: "2026-09-22",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("ngày không tồn tại (2026-02-30) → 400", async () => {
    const res = await createExpense(member, {
      familyId,
      categoryId: eatCategoryId,
      amount: 1000,
      date: "2026-02-30",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/families/:id/expenses — danh sách + lọc + phân trang", () => {
  beforeAll(async () => {
    // Data cố định: 3 món tháng 9 (09-20, 09-21, 09-22) + 1 món tháng 8
    const fixtures = [
      { amount: 10000, date: "2026-08-15" },
      { amount: 20000, date: "2026-09-20" },
      { amount: 30000, date: "2026-09-21" },
      { amount: 40000, date: "2026-09-22" },
    ];
    for (const f of fixtures) {
      const res = await createExpense(owner, { familyId, categoryId: eatCategoryId, ...f });
      expect(res.status).toBe(201);
    }
    // 4 món fixture + 1 món "Cơm trưa" của member ở describe trên = 5 món, 4 món thuộc Ăn uống... 
    // (Cơm trưa 45000 09-22 cũng thuộc Ăn uống → tổng Ăn uống tháng 9 = 4, tháng 8 = 1)
  });

  it("lọc theo month: chỉ trả khoản trong tháng đó", async () => {
    const sep = await request(app)
      .get(`/api/families/${familyId}/expenses?month=2026-09`)
      .set(auth(owner.token));
    expect(sep.status).toBe(200);
    expect(sep.body.data.expenses).toHaveLength(4);
    expect(sep.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 4 });

    const aug = await request(app)
      .get(`/api/families/${familyId}/expenses?month=2026-08`)
      .set(auth(owner.token));
    expect(aug.body.data.expenses).toHaveLength(1);
    expect(aug.body.data.expenses[0].date).toBe("2026-08-15");
  });

  it("lọc theo categoryId", async () => {
    const res = await request(app)
      .get(`/api/families/${familyId}/expenses?month=2026-09&categoryId=${eatCategoryId}`)
      .set(auth(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.data.expenses).toHaveLength(4);
    expect(res.body.data.expenses.every((e: { category: { id: string } }) => e.category.id === eatCategoryId)).toBe(
      true,
    );
  });

  it("lọc theo date: chỉ trả khoản của đúng ngày đó (09-22 có 2 món, 09-21 có 1)", async () => {
    const day22 = await request(app)
      .get(`/api/families/${familyId}/expenses?date=2026-09-22`)
      .set(auth(owner.token));
    expect(day22.status).toBe(200);
    expect(day22.body.data.expenses).toHaveLength(2);
    expect(day22.body.data.expenses.every((e: { date: string }) => e.date === "2026-09-22")).toBe(true);
    expect(day22.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 2 });

    const day21 = await request(app)
      .get(`/api/families/${familyId}/expenses?date=2026-09-21`)
      .set(auth(owner.token));
    expect(day21.body.data.expenses).toHaveLength(1);
    expect(day21.body.data.expenses[0].amount).toBe(30000);
  });

  it("date + categoryId kết hợp được; date không có khoản → trả rỗng (không lỗi)", async () => {
    const combined = await request(app)
      .get(`/api/families/${familyId}/expenses?date=2026-09-22&categoryId=${eatCategoryId}`)
      .set(auth(owner.token));
    expect(combined.status).toBe(200);
    expect(combined.body.data.expenses).toHaveLength(2);

    const empty = await request(app)
      .get(`/api/families/${familyId}/expenses?date=2026-09-25`)
      .set(auth(owner.token));
    expect(empty.status).toBe(200);
    expect(empty.body.data.expenses).toEqual([]);
    expect(empty.body.meta.total).toBe(0);
  });

  it("date ưu tiên hơn month khi truyền cả hai", async () => {
    const res = await request(app)
      .get(`/api/families/${familyId}/expenses?month=2026-09&date=2026-09-20`)
      .set(auth(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.data.expenses).toHaveLength(1);
    expect(res.body.data.expenses[0].date).toBe("2026-09-20");
  });

  it("date sai định dạng, không tồn tại hoặc truyền nhiều giá trị → 400 VALIDATION_ERROR", async () => {
    for (const bad of ["2026-09-221", "2026/09/22", "2026-02-30", "2026-13-01"]) {
      const res = await request(app).get(`/api/families/${familyId}/expenses?date=${bad}`).set(auth(owner.token));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }

    // `date=a&date=b` → query thành array, không phải 1 string date hợp lệ
    const multiRes = await request(app)
      .get(`/api/families/${familyId}/expenses?date=2026-09-21&date=2026-09-22`)
      .set(auth(owner.token));
    expect(multiRes.status).toBe(400);
    expect(multiRes.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("xếp theo date DESC, phân trang đúng", async () => {
    const p1 = await request(app)
      .get(`/api/families/${familyId}/expenses?month=2026-09&pageSize=2&page=1`)
      .set(auth(owner.token));
    expect(p1.body.data.expenses).toHaveLength(2);
    expect(p1.body.data.expenses[0].date).toBe("2026-09-22");
    expect(p1.body.meta.total).toBe(4);

    const p2 = await request(app)
      .get(`/api/families/${familyId}/expenses?month=2026-09&pageSize=2&page=2`)
      .set(auth(owner.token));
    expect(p2.body.data.expenses).toHaveLength(2);
    expect(p2.body.data.expenses[0].date).toBe("2026-09-21");
  });

  it("month sai định dạng → 400; người ngoài → 403", async () => {
    const bad = await request(app).get(`/api/families/${familyId}/expenses?month=2026-13`).set(auth(owner.token));
    expect(bad.status).toBe(400);

    const outside = await request(app).get(`/api/families/${familyId}/expenses`).set(auth(stranger.token));
    expect(outside.status).toBe(403);
  });
});

describe("GET /api/expenses/:id — chi tiết", () => {
  let expenseId: string;

  beforeAll(async () => {
    const list = await request(app)
      .get(`/api/families/${familyId}/expenses?month=2026-09`)
      .set(auth(owner.token));
    expenseId = list.body.data.expenses[0].id;
  });

  it("thành viên xem được chi tiết", async () => {
    const res = await request(app).get(`/api/expenses/${expenseId}`).set(auth(member.token));
    expect(res.status).toBe(200);
    expect(res.body.data.expense.id).toBe(expenseId);
  });

  it("người ngoài → 403, id giả → 404", async () => {
    const outside = await request(app).get(`/api/expenses/${expenseId}`).set(auth(stranger.token));
    expect(outside.status).toBe(403);

    const fake = await request(app).get(`/api/expenses/khong-ton-tai`).set(auth(owner.token));
    expect(fake.status).toBe(404);
  });
});

describe("PUT /api/expenses/:id — phân quyền: người tạo hoặc owner", () => {
  let memberExpenseId: string; // khoản do member tạo
  let ownerExpenseId: string; // khoản do owner tạo

  beforeAll(async () => {
    const memberExpense = await createExpense(member, {
      familyId,
      categoryId: eatCategoryId,
      amount: 55000,
      date: "2026-09-23",
    });
    memberExpenseId = memberExpense.body.data.expense.id;

    const ownerExpense = await createExpense(owner, {
      familyId,
      categoryId: eatCategoryId,
      amount: 66000,
      date: "2026-09-23",
    });
    ownerExpenseId = ownerExpense.body.data.expense.id;
  });

  it("người tạo sửa được khoản của mình", async () => {
    const res = await request(app)
      .put(`/api/expenses/${memberExpenseId}`)
      .set(auth(member.token))
      .send({ amount: 55500, note: "Cơm trưa (sửa lại)" });

    expect(res.status).toBe(200);
    expect(res.body.data.expense).toMatchObject({ amount: 55500, note: "Cơm trưa (sửa lại)" });
  });

  it("owner sửa được khoản của member khác", async () => {
    const res = await request(app)
      .put(`/api/expenses/${memberExpenseId}`)
      .set(auth(owner.token))
      .send({ amount: 56000 });

    expect(res.status).toBe(200);
    expect(res.body.data.expense.amount).toBe(56000);
  });

  it("member khác KHÔNG sửa được khoản của owner (403)", async () => {
    const res = await request(app)
      .put(`/api/expenses/${ownerExpenseId}`)
      .set(auth(member.token))
      .send({ amount: 1 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("xoá categoryId sang danh mục khác family → 404; đổi note = null được", async () => {
    const res = await request(app)
      .put(`/api/expenses/${memberExpenseId}`)
      .set(auth(member.token))
      .send({ note: null });
    expect(res.status).toBe(200);
    expect(res.body.data.expense.note).toBeNull();

    const badCat = await request(app)
      .put(`/api/expenses/${memberExpenseId}`)
      .set(auth(member.token))
      .send({ categoryId: "khong-thuoc-family" });
    expect(badCat.status).toBe(404);
  });
});

describe("DELETE /api/expenses/:id — phân quyền: người tạo hoặc owner", () => {
  it("owner xoá được khoản của member; GET sau đó 404", async () => {
    const created = await createExpense(member, {
      familyId,
      categoryId: eatCategoryId,
      amount: 77000,
      date: "2026-09-24",
    });
    const id = created.body.data.expense.id;

    const res = await request(app).delete(`/api/expenses/${id}`).set(auth(owner.token));
    expect(res.status).toBe(200);

    const after = await request(app).get(`/api/expenses/${id}`).set(auth(owner.token));
    expect(after.status).toBe(404);
  });

  it("member khác không xoá được khoản của owner (403)", async () => {
    const created = await createExpense(owner, {
      familyId,
      categoryId: eatCategoryId,
      amount: 88000,
      date: "2026-09-24",
    });
    const id = created.body.data.expense.id;

    const res = await request(app).delete(`/api/expenses/${id}`).set(auth(member.token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
