import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("GET /api/health", () => {
  it("trả về envelope success với status ok", async () => {
    // Arrange
    const app = createApp();

    // Act
    const res = await request(app).get("/api/health");

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.error).toBeNull();
  });
});
