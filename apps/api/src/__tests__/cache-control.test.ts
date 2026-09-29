import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("Cache-Control: no-store cho mọi response /api", () => {
  it("200 (health) → no-store", async () => {
    // Arrange
    const app = createApp();

    // Act
    const res = await request(app).get("/api/health");

    // Assert
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("401 (chưa đăng nhập) → no-store", async () => {
    // Arrange
    const app = createApp();

    // Act
    const res = await request(app).get("/api/me");

    // Assert
    expect(res.status).toBe(401);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("404 (route /api không tồn tại) → no-store", async () => {
    // Arrange
    const app = createApp();

    // Act
    const res = await request(app).get("/api/khong-ton-tai");

    // Assert
    expect(res.status).toBe(404);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
