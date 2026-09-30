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
  confirmRentalMonth,
  createRentalMonth,
  deleteRentalMonth,
  fetchRental,
  saveRentalConfig,
  updateRentalMonth,
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

const CONFIG = {
  rent: 3_200_000,
  internet: 100_000,
  elevator: 200_000,
  parking: 100_000,
  electricityRate: 4_000,
  waterRate: 35_000,
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const MONTH = {
  id: "m1",
  month: "2026-07",
  rent: 3_200_000,
  internet: 100_000,
  elevator: 200_000,
  parking: 100_000,
  oldElec: 17_743,
  newElec: 18_023,
  electricityRate: 4_000,
  oldWater: 1_001,
  newWater: 1_007,
  waterRate: 35_000,
  status: "DRAFT",
  expenseId: null,
  confirmedAt: null,
  elecConsumption: 280,
  waterConsumption: 6,
  electricityCost: 1_120_000,
  waterCost: 210_000,
  total: 4_930_000,
};

const MONTHS_KEY = "GET /api/families/f1/rental";
const EXPENSES_MONTH_KEY = "GET /api/families/f1/expenses?month=2026-07";

describe("core/dataApi — tiền phòng trọ", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mem.expenses.clear();
    mem.cache.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("fetchRental: GET /rental, trả { config, months } + ghi read cache", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ config: CONFIG, months: [MONTH] })));

    // Act
    const result = await fetchRental("f1");

    // Assert
    expect(fetchMock.mock.calls[0][0]).toBe("/api/families/f1/rental");
    expect(result).toEqual({ config: CONFIG, months: [MONTH] });
    expect(mem.cache.has(MONTHS_KEY)).toBe(true);
  });

  it("saveRentalConfig: PUT /rental/config + invalidate cache rental của family", async () => {
    // Arrange — có sẵn cache rental
    mem.cache.set(MONTHS_KEY, { key: MONTHS_KEY, savedAt: new Date().toISOString(), value: {} });
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ config: CONFIG })));

    // Act
    await saveRentalConfig("f1", CONFIG);

    // Assert
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/families/f1/rental/config");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(CONFIG);
    expect(mem.cache.has(MONTHS_KEY)).toBe(false);
  });

  it("createRentalMonth: POST /rental/months { month } + invalidate cache", async () => {
    // Arrange
    mem.cache.set(MONTHS_KEY, { key: MONTHS_KEY, savedAt: new Date().toISOString(), value: {} });
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ month: MONTH }), 201));

    // Act
    const result = await createRentalMonth("f1", "2026-07");

    // Assert
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/families/f1/rental/months");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ month: "2026-07" });
    expect(result).toEqual(MONTH);
    expect(mem.cache.has(MONTHS_KEY)).toBe(false);
  });

  it("updateRentalMonth: PUT /rental/months/:month với body partial", async () => {
    // Arrange
    mem.cache.set(MONTHS_KEY, { key: MONTHS_KEY, savedAt: new Date().toISOString(), value: {} });
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ month: MONTH })));

    // Act
    await updateRentalMonth("f1", "2026-07", { newElec: 18_074 });

    // Assert
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/families/f1/rental/months/2026-07");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ newElec: 18_074 });
    expect(mem.cache.has(MONTHS_KEY)).toBe(false);
  });

  it("confirmRentalMonth: POST .../confirm đủ 11 field + invalidate CẢ rental lẫn expense cache của tháng", async () => {
    // Arrange — có sẵn cả 2 loại cache
    mem.cache.set(MONTHS_KEY, { key: MONTHS_KEY, savedAt: new Date().toISOString(), value: {} });
    mem.cache.set(EXPENSES_MONTH_KEY, {
      key: EXPENSES_MONTH_KEY,
      savedAt: new Date().toISOString(),
      value: {},
    });
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ month: MONTH, expenseId: "e1" })));

    // Act
    const result = await confirmRentalMonth("f1", "2026-07", {
      rent: MONTH.rent,
      internet: MONTH.internet,
      elevator: MONTH.elevator,
      parking: MONTH.parking,
      oldElec: MONTH.oldElec,
      newElec: MONTH.newElec,
      electricityRate: MONTH.electricityRate,
      oldWater: MONTH.oldWater,
      newWater: MONTH.newWater,
      waterRate: MONTH.waterRate,
      date: "2026-07-01",
    });

    // Assert
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/families/f1/rental/months/2026-07/confirm");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      rent: 3_200_000,
      internet: 100_000,
      elevator: 200_000,
      parking: 100_000,
      oldElec: 17_743,
      newElec: 18_023,
      electricityRate: 4_000,
      oldWater: 1_001,
      newWater: 1_007,
      waterRate: 35_000,
      date: "2026-07-01",
    });
    expect(result).toEqual({ month: MONTH, expenseId: "e1" });
    expect(mem.cache.has(MONTHS_KEY)).toBe(false);
    expect(mem.cache.has(EXPENSES_MONTH_KEY)).toBe(false);
  });

  it("deleteRentalMonth: DELETE + invalidate rental + expense cache của tháng", async () => {
    // Arrange
    mem.cache.set(MONTHS_KEY, { key: MONTHS_KEY, savedAt: new Date().toISOString(), value: {} });
    mem.cache.set(EXPENSES_MONTH_KEY, {
      key: EXPENSES_MONTH_KEY,
      savedAt: new Date().toISOString(),
      value: {},
    });
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ ok: true })));

    // Act
    await deleteRentalMonth("f1", "2026-07");

    // Assert
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/families/f1/rental/months/2026-07");
    expect(init.method).toBe("DELETE");
    expect(mem.cache.has(MONTHS_KEY)).toBe(false);
    expect(mem.cache.has(EXPENSES_MONTH_KEY)).toBe(false);
  });
});
