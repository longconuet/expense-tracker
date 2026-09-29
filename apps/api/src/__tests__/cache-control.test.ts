import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("Cache-Control: no-store cho mọi response /api", () => {
  const assertNoCacheHeaders = (res: { headers: Record<string, string> }) => {
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["pragma"]).toBe("no-cache");
    expect(res.headers["expires"]).toBe("0");
  };

  it("200 (health) → no-store + pragma + expires", async () => {
    // Arrange
    const app = createApp();

    // Act
    const res = await request(app).get("/api/health");

    // Assert
    expect(res.status).toBe(200);
    assertNoCacheHeaders(res);
  });

  it("401 (chưa đăng nhập) → no-store + pragma + expires", async () => {
    // Arrange
    const app = createApp();

    // Act
    const res = await request(app).get("/api/me");

    // Assert
    expect(res.status).toBe(401);
    assertNoCacheHeaders(res);
  });

  it("404 (route /api không tồn tại) → no-store + pragma + expires", async () => {
    // Arrange
    const app = createApp();

    // Act
    const res = await request(app).get("/api/khong-ton-tai");

    // Assert
    expect(res.status).toBe(404);
    assertNoCacheHeaders(res);
  });
});
