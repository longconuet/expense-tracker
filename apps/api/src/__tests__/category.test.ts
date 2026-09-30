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
