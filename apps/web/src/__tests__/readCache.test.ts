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
  isServerUnavailable: (err: unknown) =>
    err instanceof ApiError && (err.status === 0 || err.status >= 500),
}));

import { idbDelete, idbGetAll } from "../core/db";
import { ApiError } from "../core/api";
import { useCacheStatus } from "../core/cacheStatus";
import {
  CACHE_MAX_AGE_MS,
  CACHE_MAX_ENTRIES,
  cacheGet,
  cacheSet,
  evictCache,
  evictCacheThrottled,
  invalidateCache,
  withReadCache,
  __resetEvictThrottle,
} from "../core/readCache";

const HOUR = 3600_000;
const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

function seedCache(key: string, value: unknown, savedAt: string) {
  mem.cache.set(key, { key, savedAt, value });
}

describe("core/readCache", () => {
  beforeEach(() => {
    mem.cache.clear();
    vi.clearAllMocks();
    __resetEvictThrottle();
    useCacheStatus.setState({ servedFromCacheAt: null, markedAt: null });
  });

  describe("cacheSet / cacheGet", () => {
    it("lưu và đọc lại đúng giá trị kèm savedAt", async () => {
      // Act
      await cacheSet("k1", { total: 42 });

      // Assert
      expect(await cacheGet("k1")).toEqual({ value: { total: 42 }, savedAt: expect.any(String) });
    });

    it("key chưa từng lưu → null", async () => {
      // Act + Assert
      expect(await cacheGet("khong-co")).toBeNull();
    });

    it("entry quá TTL (24h với expenses) → null + xoá entry", async () => {
      // Arrange
      seedCache("GET /api/families/f1/expenses?month=2026-09", { v: 1 }, isoAgo(25 * HOUR));

      // Act
      const hit = await cacheGet("GET /api/families/f1/expenses?month=2026-09");

      // Assert
      expect(hit).toBeNull();
      expect(idbDelete).toHaveBeenCalledWith("cache", "GET /api/families/f1/expenses?month=2026-09");
    });

    it("TTL theo loại key: categories chịu 7 ngày, expenses 24h", async () => {
      // Arrange — cả hai entry đều 25h tuổi
      seedCache("GET /api/families/f1/expenses?month=2026-09", { e: 1 }, isoAgo(25 * HOUR));
      seedCache("GET /api/families/f1/categories", { c: 1 }, isoAgo(25 * HOUR));

      // Act + Assert
      expect(await cacheGet("GET /api/families/f1/expenses?month=2026-09")).toBeNull();
      expect(await cacheGet("GET /api/families/f1/categories")).toEqual({
        value: { c: 1 },
        savedAt: expect.any(String),
      });
    });
  });

  describe("withReadCache", () => {
    it("thành công → trả data + lưu cache + clear status", async () => {
      // Arrange
      useCacheStatus.getState().markServed(isoAgo(1000));

      // Act
      const result = await withReadCache("k", async () => 123);

      // Assert
      expect(result).toBe(123);
      expect(await cacheGet("k")).toEqual({ value: 123, savedAt: expect.any(String) });
      // clear() có guard 2s theo markedAt — mark 1s tuổi vẫn giữ; đặt mark >2s
      // (cả 2 field) để test đường clear thật
      useCacheStatus.setState({
        servedFromCacheAt: isoAgo(3000),
        markedAt: Date.now() - 3000,
      });
      await withReadCache("k2", async () => 456);
      expect(useCacheStatus.getState().servedFromCacheAt).toBeNull();
    });

    it("server không đạt + có bản lưu trong TTL → trả bản lưu + markServed", async () => {
      // Arrange
      const savedAt = isoAgo(HOUR);
      seedCache("k", { v: 1 }, savedAt);

      // Act
      const result = await withReadCache("k", async () => {
        throw new ApiError("NETWORK_ERROR", "mất mạng", 0);
      });

      // Assert
      expect(result).toEqual({ v: 1 });
      expect(useCacheStatus.getState().servedFromCacheAt).toBe(savedAt);
    });

    it("server 500 + có bản lưu trong TTL → trả bản lưu trước", async () => {
      // Arrange
      seedCache("k", { v: 1 }, isoAgo(HOUR));

      // Act + Assert
      const result = await withReadCache("k", async () => {
        throw new ApiError("INTERNAL_ERROR", "lỗi server", 500);
      });
      expect(result).toEqual({ v: 1 });
    });

    it("server không đạt + bản lưu QUÁ TTL → ném lỗi (không trả dữ liệu cũ)", async () => {
      // Arrange
      seedCache("k", { v: 1 }, isoAgo(25 * HOUR));

      // Act + Assert
      await expect(
        withReadCache("GET /api/families/f1/expenses?month=2026-09", async () => {
          throw new ApiError("NETWORK_ERROR", "mất mạng", 0);
        }),
      ).rejects.toThrow("mất mạng");
    });

    it("server không đạt + KHÔNG có bản lưu → ném lỗi như thường", async () => {
      // Act + Assert
      await expect(
        withReadCache("khong-co-cache", async () => {
          throw new ApiError("NETWORK_ERROR", "mất mạng", 0);
        }),
      ).rejects.toThrow("mất mạng");
    });

    it("lỗi 4xx → ném lỗi, KHÔNG fallback cache", async () => {
      // Arrange
      seedCache("k", { v: 1 }, isoAgo(HOUR));

      // Act + Assert
      await expect(
        withReadCache("k", async () => {
          throw new ApiError("VALIDATION_ERROR", "sai tham số", 400);
        }),
      ).rejects.toThrow("sai tham số");
    });
  });

  describe("invalidateCache", () => {
    it("xoá đúng entry khớp predicate, giữ entry không khớp", async () => {
      // Arrange
      seedCache("GET /api/families/f1/expenses?month=2026-09", { a: 1 }, isoAgo(HOUR));
      seedCache("GET /api/families/f1/stats?month=2026-09", { b: 1 }, isoAgo(HOUR));
      seedCache("GET /api/families/f2/expenses?month=2026-09", { c: 1 }, isoAgo(HOUR));

      // Act
      await invalidateCache((key) => key.includes("/families/f1/"));

      // Assert
      expect(mem.cache.has("GET /api/families/f1/expenses?month=2026-09")).toBe(false);
      expect(mem.cache.has("GET /api/families/f1/stats?month=2026-09")).toBe(false);
      expect(mem.cache.has("GET /api/families/f2/expenses?month=2026-09")).toBe(true);
    });
  });

  describe("evictCache", () => {
    it("xoá entry già hơn 14 ngày bất kể số lượng", async () => {
      // Arrange
      seedCache("non-truoc", { a: 1 }, isoAgo(CACHE_MAX_AGE_MS + 60_000));
      seedCache("con-tai", { b: 1 }, isoAgo(HOUR));

      // Act
      await evictCache();

      // Assert
      expect(mem.cache.has("non-truoc")).toBe(false);
      expect(mem.cache.has("con-tai")).toBe(true);
    });

    it("vượt cap 300 entry → xoá entry cũ nhất xuống 240", async () => {
      // Arrange — 301 entry mới (không già), savedAt tăng dần theo i
      const base = Date.now() - 24 * HOUR;
      for (let i = 0; i < CACHE_MAX_ENTRIES + 1; i++) {
        seedCache(`k${String(i).padStart(3, "0")}`, { i }, new Date(base + i).toISOString());
      }

      // Act
      await evictCache();

      // Assert — giữ 240 entry mới nhất (k061..k300), xoá 61 entry cũ nhất
      expect(mem.cache.size).toBe(240);
      expect(mem.cache.has("k000")).toBe(false);
      expect(mem.cache.has("k060")).toBe(false);
      expect(mem.cache.has("k061")).toBe(true);
      expect(mem.cache.has("k300")).toBe(true);
    });

    it("dưới cap và không entry già → không xoá gì", async () => {
      // Arrange
      seedCache("a", { a: 1 }, isoAgo(HOUR));
      seedCache("b", { b: 1 }, isoAgo(2 * HOUR));

      // Act
      await evictCache();

      // Assert
      expect(mem.cache.size).toBe(2);
    });
  });

  describe("evictCacheThrottled", () => {
    it("2 lần gọi trong cửa sổ 60s → chỉ quét 1 lần; sau cửa sổ → quét lại", async () => {
      vi.useFakeTimers();
      try {
        const base = Date.UTC(2030, 0, 1, 10, 0, 0);
        vi.setSystemTime(base);

        // Act
        evictCacheThrottled(); // quét lần 1
        vi.setSystemTime(base + 30_000);
        evictCacheThrottled(); // trong cửa sổ → bỏ qua
        vi.setSystemTime(base + 61_000);
        evictCacheThrottled(); // hết cửa sổ → quét lần 2

        // Assert — idbGetAll gọi đúng 2 lần (1 lần/quét)
        expect(idbGetAll).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
