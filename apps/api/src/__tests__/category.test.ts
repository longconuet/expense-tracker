import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { createApp } from "../app.js";
import { prisma } from "../prisma.js";

const PASSWORD = "matkhau123";

let app: Express;
let ownerToken: string;
let family: { id: string };

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = createApp();
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: "Chủ Cat", username: "cat_owner", password: PASSWORD });
  ownerToken = reg.body.data.accessToken;

  const fam = await request(app)
    .post("/api/families")
    .set(auth(ownerToken))
    .send({ name: "Gia Đình Cat" });
  family = fam.body.data.family;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/families/:id/categories", () => {
  it("trả 8 preset mặc định xếp theo order", async () => {
    const res = await request(app).get(`/api/families/${family.id}/categories`).set(auth(ownerToken));

    expect(res.status).toBe(200);
    expect(res.body.data.categories).toHaveLength(8);
    const names = res.body.data.categories.map((c: { name: string }) => c.name);
    expect(names[0]).toBe("Ăn uống");
    expect(names[3]).toBe("Nhà trọ");
    expect(names[7]).toBe("Khác");
    for (let i = 1; i < res.body.data.categories.length; i++) {
      expect(res.body.data.categories[i].order).toBeGreaterThan(res.body.data.categories[i - 1].order);
    }
    expect(res.body.data.categories.every((c: { isPreset: boolean }) => c.isPreset)).toBe(true);
  });
});

describe("POST /api/families/:id/categories", () => {
  it("thêm category tự tạo, order kế tiếp, isPreset = false", async () => {
    const res = await request(app)
      .post(`/api/families/${family.id}/categories`)
      .set(auth(ownerToken))
      .send({ name: "Sách", icon: "📚" });

    expect(res.status).toBe(201);
    expect(res.body.data.category).toMatchObject({ name: "Sách", icon: "📚", isPreset: false, order: 8 });
  });

  it("từ chối trùng tên trong family với 409", async () => {
    const res = await request(app)
      .post(`/api/families/${family.id}/categories`)
      .set(auth(ownerToken))
      .send({ name: "Sách", icon: "📖" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CATEGORY_EXISTS");
  });
});

describe("PUT /api/families/:id/categories/:categoryId", () => {
  let presetId: string;
  let customId: string;

  beforeAll(async () => {
    const list = await request(app).get(`/api/families/${family.id}/categories`).set(auth(ownerToken));
    presetId = list.body.data.categories[0].id;
    customId = list.body.data.categories.find((c: { name: string }) => c.name === "Sách").id;
  });

  it("preset sửa tên/icon/order được như danh mục thường", async () => {
    const rename = await request(app)
      .put(`/api/families/${family.id}/categories/${presetId}`)
      .set(auth(ownerToken))
      .send({ name: "Đổi tên preset", icon: "🚀" });
    expect(rename.status).toBe(200);
    expect(rename.body.data.category).toMatchObject({ name: "Đổi tên preset", icon: "🚀" });

    const reorder = await request(app)
      .put(`/api/families/${family.id}/categories/${presetId}`)
      .set(auth(ownerToken))
      .send({ order: 99 });
    expect(reorder.status).toBe(200);
    expect(reorder.body.data.category.order).toBe(99);
  });

  it("category tự tạo đổi tên/icon được", async () => {
    const res = await request(app)
      .put(`/api/families/${family.id}/categories/${customId}`)
      .set(auth(ownerToken))
      .send({ name: "Sách vở", icon: "📖" });

    expect(res.status).toBe(200);
    expect(res.body.data.category).toMatchObject({ name: "Sách vở", icon: "📖" });
  });

  it("body rỗng → 400", async () => {
    const res = await request(app)
      .put(`/api/families/${family.id}/categories/${customId}`)
      .set(auth(ownerToken))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("trùng name trong family → 409 CATEGORY_EXISTS (không 500)", async () => {
    const res = await request(app)
      .put(`/api/families/${family.id}/categories/${customId}`)
      .set(auth(ownerToken))
      .send({ name: "Đổi tên preset" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CATEGORY_EXISTS");
  });
});

describe("POST /api/families/:id/categories/swap", () => {
  let a: { id: string; order: number };
  let b: { id: string; order: number };

  beforeAll(async () => {
    const ra = await request(app)
      .post(`/api/families/${family.id}/categories`)
      .set(auth(ownerToken))
      .send({ name: "Swap A", icon: "🔀" });
    const rb = await request(app)
      .post(`/api/families/${family.id}/categories`)
      .set(auth(ownerToken))
      .send({ name: "Swap B", icon: "🔁" });
    a = ra.body.data.category;
    b = rb.body.data.category;
  });

  afterAll(async () => {
    for (const c of [a, b]) {
      await request(app)
        .delete(`/api/families/${family.id}/categories/${c.id}`)
        .set(auth(ownerToken));
    }
  });

  it("hoán đổi order 2 category — 200, trả cả 2 row đã cập nhật", async () => {
    const res = await request(app)
      .post(`/api/families/${family.id}/categories/swap`)
      .set(auth(ownerToken))
      .send({ categoryId: a.id, targetId: b.id });

    expect(res.status).toBe(200);
    expect(res.body.data.categories).toHaveLength(2);
    const [first, second] = res.body.data.categories;
    expect(first).toMatchObject({ id: a.id, order: b.order });
    expect(second).toMatchObject({ id: b.id, order: a.order });
  });

  it("GET list sau swap đổi vị trí (b → a), swap lại thì về nguyên", async () => {
    const getList = async () => {
      const list = await request(app).get(`/api/families/${family.id}/categories`).set(auth(ownerToken));
      return list.body.data.categories as { id: string }[];
    };
    const doSwap = () =>
      request(app)
        .post(`/api/families/${family.id}/categories/swap`)
        .set(auth(ownerToken))
        .send({ categoryId: a.id, targetId: b.id });

    // Tự chứa: chuẩn hoá về trạng thái a đứng trước b (không phụ thuộc test trước)
    const list0 = await getList();
    if (list0.findIndex((c) => c.id === a.id) > list0.findIndex((c) => c.id === b.id)) {
      await doSwap();
    }

    const listBefore = await getList();
    expect(listBefore.findIndex((c) => c.id === a.id)).toBeLessThan(
      listBefore.findIndex((c) => c.id === b.id),
    );

    // Swap → b đứng trước a
    const swapped = await doSwap();
    expect(swapped.status).toBe(200);
    const listAfter = await getList();
    expect(listAfter.findIndex((c) => c.id === a.id)).toBeGreaterThan(
      listAfter.findIndex((c) => c.id === b.id),
    );

    // Swap lại → về thứ tự ban đầu
    const back = await doSwap();
    expect(back.status).toBe(200);
    const listBack = await getList();
    expect(listBack.findIndex((c) => c.id === a.id)).toBeLessThan(
      listBack.findIndex((c) => c.id === b.id),
    );
  });

  it("categoryId = targetId → 400", async () => {
    const res = await request(app)
      .post(`/api/families/${family.id}/categories/swap`)
      .set(auth(ownerToken))
      .send({ categoryId: a.id, targetId: a.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("body thiếu field → 400", async () => {
    const res = await request(app)
      .post(`/api/families/${family.id}/categories/swap`)
      .set(auth(ownerToken))
      .send({ categoryId: a.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("1 id không tồn tại → 404, order 2 row không đổi", async () => {
    const before = await request(app)
      .get(`/api/families/${family.id}/categories`)
      .set(auth(ownerToken));
    const res = await request(app)
      .post(`/api/families/${family.id}/categories/swap`)
      .set(auth(ownerToken))
      .send({ categoryId: a.id, targetId: "khong-ton-tai" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CATEGORY_NOT_FOUND");
    const after = await request(app).get(`/api/families/${family.id}/categories`).set(auth(ownerToken));
    const orderOf = (list: unknown, id: string) =>
      (list as { id: string; order: number }[]).find((c) => c.id === id)!.order;
    expect(orderOf(after.body.data.categories, a.id)).toBe(orderOf(before.body.data.categories, a.id));
    expect(orderOf(after.body.data.categories, b.id)).toBe(orderOf(before.body.data.categories, b.id));
  });

  it("2 swap chồng chéo chạy song song (a↔b + b↔c) → không sinh order trùng", async () => {
    // Thêm 1 category thứ 3 để có kịch bản chồng row (a,b) + (b,c)
    const rc = await request(app)
      .post(`/api/families/${family.id}/categories`)
      .set(auth(ownerToken))
      .send({ name: "Swap C", icon: "🔂" });
    const c = rc.body.data.category as { id: string };

    try {
      // Gọi song song — không khoá row thì 2 tx có thể cùng đọc pre-image và ghi trùng
      const [r1, r2] = await Promise.all([
        request(app)
          .post(`/api/families/${family.id}/categories/swap`)
          .set(auth(ownerToken))
          .send({ categoryId: a.id, targetId: b.id }),
        request(app)
          .post(`/api/families/${family.id}/categories/swap`)
          .set(auth(ownerToken))
          .send({ categoryId: b.id, targetId: c.id }),
      ]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);

      const list = (
        await request(app).get(`/api/families/${family.id}/categories`).set(auth(ownerToken))
      ).body.data.categories as { id: string; order: number }[];
      const orders = [a, b, c]
        .map((row) => list.find((r) => r.id === row.id)!.order)
        .sort((x, y) => x - y);
      // 3 order PHẢI KHÁC NHAU và là hoán vị của 3 giá trị ban đầu
      expect(new Set(orders).size).toBe(3);
    } finally {
      await request(app)
        .delete(`/api/families/${family.id}/categories/${c.id}`)
        .set(auth(ownerToken));
    }
  });

  it("category của family khác → 404 (không lộ/đổi được)", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ name: "Swap Khach", username: "swap_other", password: PASSWORD });
    const otherToken = reg.body.data.accessToken;
    const fam = await request(app)
      .post("/api/families")
      .set(auth(otherToken))
      .send({ name: "Family Swap Khach" });
    const otherFamilyId = fam.body.data.family.id as string;
    const list = await request(app)
      .get(`/api/families/${otherFamilyId}/categories`)
      .set(auth(otherToken));
    const foreignId = (list.body.data.categories as { id: string }[])[0].id;

    const res = await request(app)
      .post(`/api/families/${family.id}/categories/swap`)
      .set(auth(ownerToken))
      .send({ categoryId: a.id, targetId: foreignId });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CATEGORY_NOT_FOUND");
  });
});

describe("noteSuggestions — gợi ý ghi chú nhanh theo category", () => {
  let category: { id: string; noteSuggestions: string[] | null };

  beforeAll(async () => {
    const res = await request(app)
      .post(`/api/families/${family.id}/categories`)
      .set(auth(ownerToken))
      .send({ name: "Gợi ý nhanh", icon: "📝", noteSuggestions: ["Đổ xăng", "Đặt xe"] });
    expect(res.status).toBe(201);
    category = res.body.data.category;
  });

  afterAll(async () => {
    await request(app)
      .delete(`/api/families/${family.id}/categories/${category.id}`)
      .set(auth(ownerToken));
    // dọn luôn category test 2 (POST không gửi noteSuggestions)
    const list = await request(app).get(`/api/families/${family.id}/categories`).set(auth(ownerToken));
    const leftover = list.body.data.categories.find((c: { name: string }) => c.name === "Không gợi ý");
    if (leftover) {
      await request(app).delete(`/api/families/${family.id}/categories/${leftover.id}`).set(auth(ownerToken));
    }
  });

  it("POST với noteSuggestions → 201, trả đúng list", async () => {
    expect(category.noteSuggestions).toEqual(["Đổ xăng", "Đặt xe"]);
  });

  it("POST không gửi noteSuggestions → lưu null", async () => {
    const res = await request(app)
      .post(`/api/families/${family.id}/categories`)
      .set(auth(ownerToken))
      .send({ name: "Không gợi ý", icon: "📦" });
    expect(res.status).toBe(201);
    expect(res.body.data.category.noteSuggestions).toBeNull();
  });

  it("GET /categories trả noteSuggestions đúng — category khác = null", async () => {
    const list = await request(app).get(`/api/families/${family.id}/categories`).set(auth(ownerToken));
    const mine = list.body.data.categories.find((c: { name: string }) => c.name === "Gợi ý nhanh");
    // "Khác" — preset cuối, không bị test trước đổi tên/đổi order
    const other = list.body.data.categories.find((c: { name: string }) => c.name === "Khác");
    expect(mine.noteSuggestions).toEqual(["Đổ xăng", "Đặt xe"]);
    expect(other.noteSuggestions).toBeNull();
  });

  it("PUT thay thế list — name/icon giữ nguyên", async () => {
    const res = await request(app)
      .put(`/api/families/${family.id}/categories/${category.id}`)
      .set(auth(ownerToken))
      .send({ noteSuggestions: ["Tiền gửi xe"] });
    expect(res.status).toBe(200);
    expect(res.body.data.category.noteSuggestions).toEqual(["Tiền gửi xe"]);
    expect(res.body.data.category.name).toBe("Gợi ý nhanh");
    expect(res.body.data.category.icon).toBe("📝");
  });

  it("PUT {noteSuggestions: null} → xoá hết", async () => {
    const res = await request(app)
      .put(`/api/families/${family.id}/categories/${category.id}`)
      .set(auth(ownerToken))
      .send({ noteSuggestions: null });
    expect(res.status).toBe(200);
    expect(res.body.data.category.noteSuggestions).toBeNull();
  });

  it("PUT không có key noteSuggestions → giữ nguyên giá trị cũ", async () => {
    await request(app)
      .put(`/api/families/${family.id}/categories/${category.id}`)
      .set(auth(ownerToken))
      .send({ noteSuggestions: ["A", "B"] });

    const res = await request(app)
      .put(`/api/families/${family.id}/categories/${category.id}`)
      .set(auth(ownerToken))
      .send({ name: "Gợi ý nhanh 2" });
    expect(res.status).toBe(200);
    expect(res.body.data.category.noteSuggestions).toEqual(["A", "B"]);
  });

  it("PUT {noteSuggestions: []} → bình thường hoá về null", async () => {
    const res = await request(app)
      .put(`/api/families/${family.id}/categories/${category.id}`)
      .set(auth(ownerToken))
      .send({ noteSuggestions: [] });
    expect(res.status).toBe(200);
    expect(res.body.data.category.noteSuggestions).toBeNull();
  });

  it("item được trim khoảng trắng đầu/cuối", async () => {
    const res = await request(app)
      .put(`/api/families/${family.id}/categories/${category.id}`)
      .set(auth(ownerToken))
      .send({ noteSuggestions: ["  X  "] });
    expect(res.status).toBe(200);
    expect(res.body.data.category.noteSuggestions).toEqual(["X"]);
  });

  it("vượt 8 mục → 400 (POST + PUT)", async () => {
    const nine = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const put = await request(app)
      .put(`/api/families/${family.id}/categories/${category.id}`)
      .set(auth(ownerToken))
      .send({ noteSuggestions: nine });
    expect(put.status).toBe(400);
    expect(put.body.error.code).toBe("VALIDATION_ERROR");

    const post = await request(app)
      .post(`/api/families/${family.id}/categories`)
      .set(auth(ownerToken))
      .send({ name: "Vượt trần", icon: "❌", noteSuggestions: nine });
    expect(post.status).toBe(400);
    expect(post.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("mục rỗng / chỉ khoảng trắng → 400", async () => {
    for (const bad of [[""], ["   "], ["OK", "  "]]) {
      const res = await request(app)
        .put(`/api/families/${family.id}/categories/${category.id}`)
        .set(auth(ownerToken))
        .send({ noteSuggestions: bad });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("mục > 30 ký tự → 400 (POST + PUT)", async () => {
    const put = await request(app)
      .put(`/api/families/${family.id}/categories/${category.id}`)
      .set(auth(ownerToken))
      .send({ noteSuggestions: ["a".repeat(31)] });
    expect(put.status).toBe(400);
    expect(put.body.error.code).toBe("VALIDATION_ERROR");

    const post = await request(app)
      .post(`/api/families/${family.id}/categories`)
      .set(auth(ownerToken))
      .send({ name: "Dài quá", icon: "❌", noteSuggestions: ["a".repeat(31)] });
    expect(post.status).toBe(400);
    expect(post.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("không phải array string → 400 (POST + PUT)", async () => {
    const put = await request(app)
      .put(`/api/families/${family.id}/categories/${category.id}`)
      .set(auth(ownerToken))
      .send({ noteSuggestions: "Đổ xăng" });
    expect(put.status).toBe(400);

    const post = await request(app)
      .post(`/api/families/${family.id}/categories`)
      .set(auth(ownerToken))
      .send({ name: "Sai kiểu", icon: "❌", noteSuggestions: 123 });
    expect(post.status).toBe(400);
    expect(post.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("DELETE /api/families/:id/categories/:categoryId", () => {
  it("preset xoá được khi không có khoản chi", async () => {
    const list = await request(app).get(`/api/families/${family.id}/categories`).set(auth(ownerToken));
    const preset = list.body.data.categories.find((c: { isPreset: boolean }) => c.isPreset);

    const res = await request(app)
      .delete(`/api/families/${family.id}/categories/${preset.id}`)
      .set(auth(ownerToken));

    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
  });

  it("preset đang có khoản chi thì không xoá (409) — guard duy nhất còn lại", async () => {
    const list = await request(app).get(`/api/families/${family.id}/categories`).set(auth(ownerToken));
    const preset = list.body.data.categories.find((c: { isPreset: boolean }) => c.isPreset);

    const exp = await request(app)
      .post("/api/expenses")
      .set(auth(ownerToken))
      .send({
        familyId: family.id,
        categoryId: preset.id,
        amount: 5000,
        date: "2026-09-23",
      });
    expect(exp.status).toBe(201);

    const blocked = await request(app)
      .delete(`/api/families/${family.id}/categories/${preset.id}`)
      .set(auth(ownerToken));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("CATEGORY_IN_USE");

    // dọn khoản chi để không ảnh hưởng test khác
    await request(app).delete(`/api/expenses/${exp.body.data.expense.id}`).set(auth(ownerToken));
  });

  it("có khoản chi thì không xoá (409), hết khoản chi thì xoá được", async () => {
    const list = await request(app).get(`/api/families/${family.id}/categories`).set(auth(ownerToken));
    const custom = list.body.data.categories.find((c: { name: string }) => c.name === "Sách vở");

    // thêm 1 khoản chi vào category này
    const exp = await request(app)
      .post("/api/expenses")
      .set(auth(ownerToken))
      .send({
        familyId: family.id,
        categoryId: custom.id,
        amount: 10000,
        date: "2026-09-22",
      });
    expect(exp.status).toBe(201);

    const blocked = await request(app)
      .delete(`/api/families/${family.id}/categories/${custom.id}`)
      .set(auth(ownerToken));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("CATEGORY_IN_USE");

    // xoá khoản chi rồi xoá category
    await request(app).delete(`/api/expenses/${exp.body.data.expense.id}`).set(auth(ownerToken));

    const ok = await request(app)
      .delete(`/api/families/${family.id}/categories/${custom.id}`)
      .set(auth(ownerToken));
    expect(ok.status).toBe(200);
  });
});
