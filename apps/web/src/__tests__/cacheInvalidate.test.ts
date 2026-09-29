import { beforeEach, describe, expect, it, vi } from "vitest";

const invalidateCacheMock = vi.hoisted(
  () => vi.fn(async (_predicate: (key: string) => boolean) => {}),
);

vi.mock("../core/readCache", () => ({
  invalidateCache: invalidateCacheMock,
}));

import {
  invalidateExpenseCache,
  invalidateFamilyCache,
  parseCacheKey,
} from "../core/cacheInvalidate";

/** Lấy predicate truyền cho invalidateCache từ lần gọi cuối (1 lần/gọi). */
function lastPredicate(): (key: string) => boolean {
  expect(invalidateCacheMock).toHaveBeenCalledTimes(1);
  return invalidateCacheMock.mock.calls[0][0];
}

const F1 = "GET /api/families/f1";

describe("core/cacheInvalidate", () => {
  beforeEach(() => {
    invalidateCacheMock.mockClear();
  });

  describe("parseCacheKey", () => {
    it("key hợp lệ không query → familyId + resource đúng", () => {
      // Act
      const parsed = parseCacheKey(`${F1}/categories`);

      // Assert
      expect(parsed).toEqual({
        familyId: "f1",
        resource: "categories",
        params: new URLSearchParams(),
      });
    });

    it("key hợp lệ kèm query → params tách đúng", () => {
      // Act
      const parsed = parseCacheKey(`${F1}/expenses?month=2026-09&page=2`);

      // Assert
      expect(parsed?.resource).toBe("expenses");
      expect(parsed?.params.get("month")).toBe("2026-09");
      expect(parsed?.params.get("page")).toBe("2");
    });

    it("key không khớp hình dạng chuẩn → null", () => {
      // Act + Assert
      expect(parseCacheKey("GET /api/expenses/e1")).toBeNull();
      expect(parseCacheKey("GET /api/families/f1/unknown")).toBeNull();
      expect(parseCacheKey("POST /api/families/f1/expenses")).toBeNull();
      expect(parseCacheKey("")).toBeNull();
    });
  });

  describe("invalidateExpenseCache", () => {
    it("xoá key đúng family + tháng/ngày (kể cả key không filter), giữ phần còn lại", () => {
      // Act
      invalidateExpenseCache("f1", ["2026-09"], ["2026-09-05"]);
      const predicate = lastPredicate();

      // Assert — bị xoá
      expect(predicate(`${F1}/expenses?month=2026-09&page=1&pageSize=20`)).toBe(true);
      expect(predicate(`${F1}/expenses?date=2026-09-05&pageSize=100`)).toBe(true);
      expect(predicate(`${F1}/expenses?month=2026-09&categoryId=c1`)).toBe(true);
      expect(predicate(`${F1}/stats?month=2026-09`)).toBe(true);
      expect(predicate(`${F1}/expenses`)).toBe(true); // list không lọc — chắc chắn chứa khoản mới

      // Assert — được giữ
      expect(predicate(`${F1}/expenses?month=2026-08`)).toBe(false);
      expect(predicate(`${F1}/expenses?date=2026-09-06`)).toBe(false);
      expect(predicate(`${F1}/categories`)).toBe(false);
      expect(predicate("GET /api/families/f2/expenses?month=2026-09")).toBe(false);
      expect(predicate("GET /api/expenses/e1")).toBe(false);
    });
  });

  describe("invalidateFamilyCache", () => {
    it("xoá toàn bộ 3 resource của family, giữ family khác", () => {
      // Act
      invalidateFamilyCache("f1");
      const predicate = lastPredicate();

      // Assert
      expect(predicate(`${F1}/categories`)).toBe(true);
      expect(predicate(`${F1}/expenses?month=2026-09`)).toBe(true);
      expect(predicate(`${F1}/stats?month=2026-09`)).toBe(true);
      expect(predicate("GET /api/families/f2/categories")).toBe(false);
      expect(predicate("GET /api/me")).toBe(false);
    });
  });
});
