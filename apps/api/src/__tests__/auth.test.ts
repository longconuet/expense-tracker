import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { createApp } from "../app.js";
import { prisma } from "../prisma.js";

const PASSWORD = "matkhau123";

let app: Express;

type SetCookie = string[] | string | undefined;

function allCookies(setCookie: SetCookie): string[] {
  return Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
}

/** Chỉ lấy phần name=value (gửi lại trong header Cookie). */
function extractRefreshCookie(setCookie: SetCookie): string {
  const found = allCookies(setCookie).find((c) => c.startsWith("etracker_refresh="));
  return found ? found.split(";")[0] : "";
}

/** Lấy cả thuộc tính cookie (kiểm tra httpOnly...). */
function fullRefreshCookie(setCookie: SetCookie): string | undefined {
  return allCookies(setCookie).find((c) => c.startsWith("etracker_refresh="));
}

async function registerUser(name: string, username: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name, username, password: PASSWORD });
  expect(res.status).toBe(201);
  return {
    accessToken: res.body.data.accessToken,
    refreshCookie: extractRefreshCookie(res.headers["set-cookie"]),
    user: res.body.data.user,
  };
}

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/auth/register", () => {
  it("tạo user mới, trả access token + refresh cookie httpOnly", async () => {
    // Act
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Nguyễn Văn A", username: "user_a1", password: PASSWORD });

    // Assert
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toEqual({
      id: expect.any(String),
      name: "Nguyễn Văn A",
      username: "user_a1",
    });
    expect(typeof res.body.data.accessToken).toBe("string");
    const fullCookie = fullRefreshCookie(res.headers["set-cookie"]);
    expect(fullCookie).toMatch(/^etracker_refresh=/);
    expect(fullCookie).toMatch(/httponly/i);
  });

  it("từ chối username trùng (kể cả khác hoa thường, thừa khoảng trắng) với 409", async () => {
    await registerUser("Nguyễn Văn A", "user_a2");

    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Nguyễn Văn B", username: " User_A2 ", password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("USERNAME_TAKEN");
  });

  it("từ chối dữ liệu không hợp lệ với 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "A", username: "x", password: "ngan" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toContain("name");
    expect(res.body.error.message).toContain("username");
    expect(res.body.error.message).toContain("password");
  });
});

describe("POST /api/auth/login", () => {
  it("đăng nhập đúng → access token + refresh cookie", async () => {
    await registerUser("Trần Thị B", "user_b1");

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "user_b1", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe("user_b1");
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(extractRefreshCookie(res.headers["set-cookie"])).toMatch(/^etracker_refresh=/);
  });

  it("sai mật khẩu → 401 INVALID_CREDENTIALS", async () => {
    await registerUser("Trần Thị C", "user_b2");

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "user_b2", password: "sai-mat-khau" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("username không tồn tại → 401 INVALID_CREDENTIALS (cùng message, không tiết lộ tồn tại)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "user_khong_ton_tai", password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /api/me", () => {
  it("trả user + danh sách family rỗng khi vừa đăng ký", async () => {
    const { accessToken } = await registerUser("Lê Văn C", "user_c");

    const res = await request(app).get("/api/me").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe("user_c");
    expect(res.body.data.families).toEqual([]);
  });

  it("không có token → 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("token rác → 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/me").set("Authorization", "Bearer token-rac");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("POST /api/auth/refresh", () => {
  it("đổi refresh cookie thành cặp token mới (rotation)", async () => {
    const { accessToken, refreshCookie } = await registerUser("Phạm Thị D", "user_d");
    expect(refreshCookie).toBeTruthy();

    const res = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie);

    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe("string");
    // jti khác nhau → access token mới luôn khác token cũ
    expect(res.body.data.accessToken).not.toBe(accessToken);
    expect(extractRefreshCookie(res.headers["set-cookie"])).toBeTruthy();
  });

  it("không có cookie → 401", async () => {
    const res = await request(app).post("/api/auth/refresh");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("cookie rác → 401", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", "etracker_refresh=abc.def.ghi");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("POST /api/auth/logout", () => {
  it("xoá refresh cookie (giá trị rỗng + hết hạn)", async () => {
    await registerUser("Hoàng Văn E", "user_e");

    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(200);
    const cleared = fullRefreshCookie(res.headers["set-cookie"]);
    expect(cleared).toMatch(/^etracker_refresh=;/); // giá trị rỗng
    expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });
});
