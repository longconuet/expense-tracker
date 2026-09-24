import { beforeEach, describe, expect, it, vi } from "vitest";

const { mem } = vi.hoisted(() => ({
  mem: {
    expenses: new Map<string, unknown>(),
    cache: new Map<string, unknown>(),
  },
}));

// Mock db để test đường ghi offline + read cache (jsdom không có IndexedDB)
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
  createCategory,
  createExpense,
  deleteCategory,
  fetchCategories,
  fetchExpense,
  fetchExpenses,
  fetchStats,
  updateCategory,
  updateExpense,
} from "../core/dataApi";

function envelope(data: unknown, meta?: { page: number; pageSize: number; total: number }) {
  return meta
    ? { success: true, data, error: null, meta }
    : { success: true, data, error: null };
}

function fakeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const CAT = { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 };
const EXPENSE = {
  id: "e1",
  amount: 50000,
  date: "2026-09-01",
  note: "cơm trưa",
  category: CAT,
  createdByName: "An",
  createdAt: "2026-09-01T06:00:00.000Z",
};

describe("core/dataApi", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mem.expenses.clear();
    mem.cache.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("fetchExpenses gộp đúng query string + trả meta phân trang", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(
      fakeResponse(envelope({ expenses: [EXPENSE] }, { page: 2, pageSize: 10, total: 25 })),
    );

    // Act
    const result = await fetchExpenses("f1", {
      month: "2026-09",
      categoryId: "c1",
      page: 2,
      pageSize: 10,
    });

    // Assert
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/families/f1/expenses?month=2026-09&categoryId=c1&page=2&pageSize=10",
    );
    expect(result.expenses).toEqual([EXPENSE]);
    expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 25 });
  });

  it("fetchExpenses không có filter → không có query string", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ expenses: [] }, { page: 1, pageSize: 20, total: 0 })));

    // Act
    await fetchExpenses("f1");

    // Assert
    expect(fetchMock.mock.calls[0][0]).toBe("/api/families/f1/expenses");
  });

  it("createExpense POST đúng payload (category → categoryId)", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ expense: EXPENSE }), 201));

    // Act
    const result = await createExpense({
      familyId: "f1",
      category: CAT,
      amount: 50000,
      date: "2026-09-01",
      note: "cơm trưa",
    });

    // Assert
    expect(result.savedOffline).toBe(false);
    expect(result.expense?.id).toBe("e1");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/expenses");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      familyId: "f1",
      categoryId: "c1",
      amount: 50000,
      date: "2026-09-01",
      note: "cơm trưa",
    });
  });

  it("createExpense: server không đạt (lỗi mạng) → lưu hàng đợi offline", async () => {
    // Arrange
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    // Act
    const result = await createExpense({
      familyId: "f1",
      category: CAT,
      amount: 50000,
      date: "2026-09-01",
      note: "cơm trưa",
    });

    // Assert
    expect(result.savedOffline).toBe(true);
    expect(result.expense).toBeNull();
    const queued = [...mem.expenses.values()];
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      familyId: "f1",
      categoryId: "c1",
      category: { name: "Ăn uống", icon: "🍜" },
      amount: 50000,
      date: "2026-09-01",
      note: "cơm trưa",
    });
  });

  it("createExpense: server 500 (response không phải JSON) → lưu hàng đợi offline", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("body là HTML, không phải JSON");
      },
    } as unknown as Response);

    // Act
    const result = await createExpense({
      familyId: "f1",
      category: CAT,
      amount: 10000,
      date: "2026-09-01",
    });

    // Assert
    expect(result.savedOffline).toBe(true);
    expect(mem.expenses.size).toBe(1);
  });

  it("createExpense: lỗi API 4xx → ném lỗi, không lưu hàng đợi", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(
      fakeResponse(
        { success: false, data: null, error: { code: "VALIDATION_ERROR", message: "amount phải > 0" } },
        400,
      ),
    );

    // Act + Assert
    await expect(
      createExpense({ familyId: "f1", category: CAT, amount: -1, date: "2026-09-01" }),
    ).rejects.toThrow("amount phải > 0");
    expect(mem.expenses.size).toBe(0);
  });

  it("fetchExpense gọi GET /api/expenses/:id và trả expense", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ expense: EXPENSE })));

    // Act
    const expense = await fetchExpense("e1");

    // Assert
    expect(fetchMock.mock.calls[0][0]).toBe("/api/expenses/e1");
    expect(expense).toEqual(EXPENSE);
  });

  it("updateExpense gửi PUT đúng payload (note null = xoá ghi chú)", async () => {
    // Arrange
    const updated = { ...EXPENSE, amount: 45_000, date: "2026-09-02", note: null };
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ expense: updated })));

    // Act
    const expense = await updateExpense("e1", {
      amount: 45_000,
      categoryId: "c2",
      date: "2026-09-02",
      note: null,
    });

    // Assert
    expect(fetchMock.mock.calls[0][0]).toBe("/api/expenses/e1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      amount: 45_000,
      categoryId: "c2",
      date: "2026-09-02",
      note: null,
    });
    expect(expense).toEqual(updated);
  });

  it("fetchCategories trả list categories của family", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ categories: [CAT] })));

    // Act
    const categories = await fetchCategories("f1");

    // Assert
    expect(fetchMock.mock.calls[0][0]).toBe("/api/families/f1/categories");
    expect(categories).toEqual([CAT]);
  });

  // ---------------------------------------------------------------------
  // Category CRUD
  // ---------------------------------------------------------------------

  it("createCategory POST đúng payload và trả category", async () => {
    // Arrange
    const created = { id: "c9", name: "Tiền điện", icon: "⚡", isPreset: false, order: 7 };
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ category: created }), 201));

    // Act
    const category = await createCategory("f1", { name: "Tiền điện", icon: "⚡" });

    // Assert
    expect(fetchMock.mock.calls[0][0]).toBe("/api/families/f1/categories");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: "Tiền điện",
      icon: "⚡",
    });
    expect(category).toEqual(created);
  });

  it("createCategory 409 trùng tên → ném ApiError (không fallback)", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(
      fakeResponse(
        {
          success: false,
          data: null,
          error: { code: "CATEGORY_EXISTS", message: "Danh mục này đã tồn tại" },
        },
        409,
      ),
    );

    // Act + Assert
    await expect(createCategory("f1", { name: "Ăn uống", icon: "🍜" })).rejects.toMatchObject({
      code: "CATEGORY_EXISTS",
      status: 409,
      message: "Danh mục này đã tồn tại",
    });
  });

  it("updateCategory gửi PUT đúng payload (name/icon/order)", async () => {
    // Arrange
    const updated = { id: "c9", name: "Điện nước", icon: "💧", isPreset: false, order: 2 };
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ category: updated })));

    // Act
    const category = await updateCategory("f1", "c9", { name: "Điện nước", icon: "💧", order: 2 });

    // Assert
    expect(fetchMock.mock.calls[0][0]).toBe("/api/families/f1/categories/c9");
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: "Điện nước",
      icon: "💧",
      order: 2,
    });
    expect(category).toEqual(updated);
  });

  it("deleteCategory gọi DELETE đúng path", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ ok: true })));

    // Act
    await deleteCategory("f1", "c9");

    // Assert
    expect(fetchMock.mock.calls[0][0]).toBe("/api/families/f1/categories/c9");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("fetchStats có/không có month", async () => {
    // Arrange
    const stats = {
      month: "2026-09",
      total: 100,
      previousMonthTotal: 50,
      byCategory: [],
      byDay: [],
    };
    fetchMock
      .mockResolvedValueOnce(fakeResponse(envelope(stats)))
      .mockResolvedValueOnce(fakeResponse(envelope(stats)));

    // Act
    await fetchStats("f1", "2026-09");
    await fetchStats("f1");

    // Assert
    expect(fetchMock.mock.calls[0][0]).toBe("/api/families/f1/stats?month=2026-09");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/families/f1/stats");
  });

  // ---------------------------------------------------------------------
  // Read cache: server down → trả bản lưu trước (stale-while-error)
  // ---------------------------------------------------------------------

  it("fetchCategories: server 500 sau lần gọi OK → trả bản lưu trước", async () => {
    // Arrange
    fetchMock
      .mockResolvedValueOnce(fakeResponse(envelope({ categories: [CAT] })))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("body HTML, không phải JSON");
        },
      } as unknown as Response);

    // Act
    const first = await fetchCategories("f1");
    const second = await fetchCategories("f1"); // server down

    // Assert
    expect(first).toEqual([CAT]);
    expect(second).toEqual([CAT]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fetchExpenses: server down → trả list lưu trước (kèm meta phân trang)", async () => {
    // Arrange
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse(envelope({ expenses: [EXPENSE] }, { page: 1, pageSize: 20, total: 1 })),
      )
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    // Act
    const first = await fetchExpenses("f1", { pageSize: 20 });
    const second = await fetchExpenses("f1", { pageSize: 20 });

    // Assert
    expect(first.expenses).toEqual([EXPENSE]);
    expect(second.expenses).toEqual([EXPENSE]);
    expect(second.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it("fetchStats: server down → trả thống kê lưu trước", async () => {
    // Arrange
    const stats = {
      month: "2026-09",
      total: 100,
      previousMonthTotal: 50,
      byCategory: [],
      byDay: [],
    };
    fetchMock
      .mockResolvedValueOnce(fakeResponse(envelope(stats)))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    // Act
    await fetchStats("f1", "2026-09");
    const second = await fetchStats("f1", "2026-09");

    // Assert
    expect(second).toEqual(stats);
  });

  it("read cache: lỗi 4xx → ném lỗi, không fallback bản lưu", async () => {
    // Arrange — có bản lưu sẵn
    fetchMock
      .mockResolvedValueOnce(fakeResponse(envelope({ categories: [CAT] })))
      .mockResolvedValueOnce(
        fakeResponse(
          { success: false, data: null, error: { code: "FORBIDDEN", message: "không có quyền" } },
          403,
        ),
      );

    // Act + Assert
    await fetchCategories("f1");
    await expect(fetchCategories("f1")).rejects.toThrow("không có quyền");
  });
});
