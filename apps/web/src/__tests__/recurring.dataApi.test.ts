import { beforeEach, describe, expect, it, vi } from "vitest";

const { mem } = vi.hoisted(() => ({
  mem: {
    expenses: new Map<string, unknown>(),
    cache: new Map<string, unknown>(),
  },
}));

// Mock db (jsdom không có IndexedDB) — read cache + invalidation chạy trên map bộ nhớ
vi.mock("../core/db", () => ({
  idbPut: vi.fn(async (store: string, value: { id?: string; key?: string }) => {
    const k = value.key ?? value.id!;
    mem[store as "expenses" | "cache"].set(k, value);
    return k;
  }),
  idbGet: vi.fn(async (store: string, key: string) => mem[store as "expenses" | "cache"].get(key)),
  idbGetAll: vi.fn(async (store: string) => [...mem[store as "expenses" | "cache"].values()]),
  idbDelete: vi.fn(async (store: string, key: string) => {
    mem[store as "expenses" | "cache"].delete(key);
  }),
}));

import {
  createRecurringRule,
  deleteRecurringRule,
  fetchRecurring,
  materializeRecurring,
  updateRecurringRule,
} from "../core/dataApi";

function envelope(data: unknown) {
  return { success: true, data, error: null };
}

function fakeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const CATEGORY = { id: "c1", name: "Tiền điện", icon: "⚡", isPreset: true, order: 1 };

const RULE = {
  id: "r1",
  familyId: "f1",
  categoryId: "c1",
  category: CATEGORY,
  amount: 1_500_000,
  note: "Tiền điện",
  frequency: "MONTHLY" as const,
  startDate: "2026-09-01",
  endType: "COUNT" as const,
  endDate: null,
  occurrenceCount: 3,
  nextDate: "2026-10-01",
  generatedCount: 1,
  completedAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
};

const RECURRING_KEY = "GET /api/families/f1/recurring";
const EXPENSES_AUG_KEY = "GET /api/families/f1/expenses?month=2026-08";
const EXPENSES_SEP_KEY = "GET /api/families/f1/expenses?month=2026-09";
const EXPENSES_DATE_AUG_KEY = "GET /api/families/f1/expenses?date=2026-08-05";
const EXPENSES_DATE_OTHER_KEY = "GET /api/families/f1/expenses?date=2026-08-06";
const EXPENSES_OCT_KEY = "GET /api/families/f1/expenses?month=2026-10";
const EXPENSES_NOFILTER_KEY = "GET /api/families/f1/expenses";

function seed(key: string) {
  mem.cache.set(key, { key, savedAt: new Date().toISOString(), value: {} });
}

describe("core/dataApi — giao dịch định kỳ (spec-recurring §5.2: case 48–50)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mem.expenses.clear();
    mem.cache.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("#48 fetchRecurring: GET /api/families/<fid>/recurring → { rules }, key read cache đúng dạng", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ rules: [RULE] })));

    // Act
    const result = await fetchRecurring("f1");

    // Assert
    expect(fetchMock.mock.calls[0][0]).toBe("/api/families/f1/recurring");
    expect(result).toEqual({ rules: [RULE] });
    // Key đúng dạng "GET /api/families/<fid>/recurring" (ttlFor/parseCacheKey nhận diện)
    expect(mem.cache.has(RECURRING_KEY)).toBe(true);
  });

  it("#48 fetchRecurring: server down → trả rules lưu trong read cache", async () => {
    // Arrange
    fetchMock
      .mockResolvedValueOnce(fakeResponse(envelope({ rules: [RULE] })))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    // Act
    const first = await fetchRecurring("f1");
    const second = await fetchRecurring("f1");

    // Assert
    expect(first).toEqual({ rules: [RULE] });
    expect(second).toEqual({ rules: [RULE] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("#49 createRecurringRule: POST đúng path + body, invalidate cache recurring của family", async () => {
    // Arrange
    seed(RECURRING_KEY);
    const input = {
      categoryId: "c1",
      amount: 1_500_000,
      note: "Tiền điện",
      startDate: "2026-10-01",
      endType: "COUNT" as const,
      occurrenceCount: 3,
    };
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ rule: RULE }), 201));

    // Act
    const rule = await createRecurringRule("f1", input);

    // Assert
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/families/f1/recurring");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(input);
    expect(rule).toEqual(RULE);
    expect(mem.cache.has(RECURRING_KEY)).toBe(false);
  });

  it("#49 updateRecurringRule: PUT /api/recurring/:id + invalidate cache", async () => {
    // Arrange
    seed(RECURRING_KEY);
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ rule: RULE })));

    // Act
    const rule = await updateRecurringRule("f1", "r1", { amount: 900_000 });

    // Assert
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/recurring/r1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ amount: 900_000 });
    expect(rule).toEqual(RULE);
    expect(mem.cache.has(RECURRING_KEY)).toBe(false);
  });

  it("#49 deleteRecurringRule: DELETE /api/recurring/:id + invalidate cache", async () => {
    // Arrange
    seed(RECURRING_KEY);
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ ok: true })));

    // Act
    await deleteRecurringRule("f1", "r1");

    // Assert
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/recurring/r1");
    expect(init.method).toBe("DELETE");
    expect(mem.cache.has(RECURRING_KEY)).toBe(false);
  });

  it("#50 materializeRecurring count 2 (2 tháng khác nhau) → invalidate expense cache đúng 2 months + 2 dates", async () => {
    // Arrange — cache các tháng bị ảnh hưởng + tháng không liên quan + key lọc ngày
    seed(EXPENSES_AUG_KEY);
    seed(EXPENSES_SEP_KEY);
    seed(EXPENSES_DATE_AUG_KEY);
    seed(EXPENSES_DATE_OTHER_KEY);
    seed(EXPENSES_OCT_KEY);
    seed(EXPENSES_NOFILTER_KEY);
    fetchMock.mockResolvedValueOnce(
      fakeResponse(
        envelope({
          count: 2,
          created: [
            { expenseId: "e1", date: "2026-08-05", month: "2026-08" },
            { expenseId: "e2", date: "2026-09-05", month: "2026-09" },
          ],
        }),
      ),
    );

    // Act
    const result = await materializeRecurring("f1");

    // Assert — gọi đúng endpoint, trả nguyên result
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/families/f1/recurring/materialize");
    expect(init.method).toBe("POST");
    expect(result.count).toBe(2);
    // Month 2026-08 + 2026-09 (kèm key không filter) bị xoá; 2026-10 giữ
    expect(mem.cache.has(EXPENSES_AUG_KEY)).toBe(false);
    expect(mem.cache.has(EXPENSES_SEP_KEY)).toBe(false);
    expect(mem.cache.has(EXPENSES_NOFILTER_KEY)).toBe(false);
    expect(mem.cache.has(EXPENSES_OCT_KEY)).toBe(true);
    // Date 2026-08-05 bị xoá; ngày khác giữ
    expect(mem.cache.has(EXPENSES_DATE_AUG_KEY)).toBe(false);
    expect(mem.cache.has(EXPENSES_DATE_OTHER_KEY)).toBe(true);
  });

  it("#50 materializeRecurring count 0 → không động expense cache", async () => {
    // Arrange
    seed(EXPENSES_NOFILTER_KEY);
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ count: 0, created: [] })));

    // Act
    const result = await materializeRecurring("f1");

    // Assert
    expect(result).toEqual({ count: 0, created: [] });
    expect(mem.cache.has(EXPENSES_NOFILTER_KEY)).toBe(true);
  });
});
