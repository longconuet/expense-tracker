import { beforeEach, describe, expect, it, vi } from "vitest";

const { mem } = vi.hoisted(() => ({
  mem: {
    expenses: new Map<string, unknown>(),
    cache: new Map<string, unknown>(),
  },
}));

vi.mock("../core/db", () => ({
  idbPut: vi.fn(async (store: string, value: { id?: string; key?: string }) => {
    const key = value.key ?? value.id!;
    mem[store as "expenses" | "cache"].set(key, value);
    return key;
  }),
  idbGet: vi.fn(async (store: string, key: string) => mem[store as "expenses" | "cache"].get(key)),
  idbGetAll: vi.fn(async (store: string) => [...mem[store as "expenses" | "cache"].values()]),
  idbDelete: vi.fn(async (store: string, key: string) => {
    mem[store as "expenses" | "cache"].delete(key);
  }),
}));

vi.mock("../core/api", () => ({
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.name = "ApiError";
      this.code = code;
      this.status = status;
    }
  },
}));

import { ApiError } from "../core/api";
import { cacheGet, cacheSet, withReadCache } from "../core/readCache";

describe("core/readCache", () => {
  beforeEach(() => {
    mem.cache.clear();
  });

  it("cacheSet + cacheGet: lưu và đọc lại đúng giá trị", async () => {
    // Act
    await cacheSet("k1", { total: 42 });

    // Assert
    expect(await cacheGet("k1")).toEqual({ total: 42 });
  });

  it("cacheGet key chưa từng lưu → null", async () => {
    // Act + Assert
    expect(await cacheGet("khong-co")).toBeNull();
  });

  it("withReadCache: thành công → trả data + lưu vào cache", async () => {
    // Act
    const result = await withReadCache("k", async () => 123);

    // Assert
    expect(result).toBe(123);
    expect(await cacheGet("k")).toBe(123);
  });

  it("withReadCache: server không đạt + có bản lưu → trả bản lưu trước", async () => {
    // Arrange
    await cacheSet("k", { v: 1 });

    // Act
    const result = await withReadCache("k", async () => {
      throw new ApiError("NETWORK_ERROR", "mất mạng", 0);
    });

    // Assert
    expect(result).toEqual({ v: 1 });
  });

  it("withReadCache: server 500 + có bản lưu → trả bản lưu trước", async () => {
    // Arrange
    await cacheSet("k", { v: 1 });

    // Act + Assert
    const result = await withReadCache("k", async () => {
      throw new ApiError("INTERNAL_ERROR", "lỗi server", 500);
    });
    expect(result).toEqual({ v: 1 });
  });

  it("withReadCache: server không đạt + KHÔNG có bản lưu → ném lỗi như thường", async () => {
    // Act + Assert
    await expect(
      withReadCache("khong-co-cache", async () => {
        throw new ApiError("NETWORK_ERROR", "mất mạng", 0);
      }),
    ).rejects.toThrow("mất mạng");
  });

  it("withReadCache: lỗi 4xx → ném lỗi, KHÔNG fallback cache", async () => {
    // Arrange
    await cacheSet("k", { v: 1 });

    // Act + Assert
    await expect(
      withReadCache("k", async () => {
        throw new ApiError("VALIDATION_ERROR", "sai tham số", 400);
      }),
    ).rejects.toThrow("sai tham số");
  });
});
