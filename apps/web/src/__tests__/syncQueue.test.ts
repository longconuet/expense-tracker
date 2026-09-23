import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mem } = vi.hoisted(() => ({
  mem: {
    expenses: new Map<string, unknown>(),
    cache: new Map<string, unknown>(),
  },
}));

vi.mock("../core/db", () => ({
  idbPut: vi.fn(async (store: string, value: { id?: string }) => {
    mem[store as "expenses"].set(value.id!, value);
    return value.id;
  }),
  idbGet: vi.fn(async (store: string, key: string) => mem[store as "expenses"].get(key)),
  idbGetAll: vi.fn(async (store: string) => [...mem[store as "expenses"].values()]),
  idbDelete: vi.fn(async (store: string, key: string) => {
    mem[store as "expenses"].delete(key);
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
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(),
}));

import { ApiError, apiFetch, getAccessToken } from "../core/api";
import {
  enqueueExpense,
  flushQueue,
  getPendingExpenses,
  isServerUnavailable,
  SYNCED_EVENT,
  useSyncStore,
} from "../core/syncQueue";

const apiFetchMock = vi.mocked(apiFetch);
const getTokenMock = vi.mocked(getAccessToken);

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    familyId: "f1",
    categoryId: "c1",
    category: { name: "Ăn uống", icon: "🍜" },
    amount: 50000,
    date: "2026-09-01",
    note: null,
    ...overrides,
  };
}

describe("core/syncQueue", () => {
  const syncedSpy = vi.fn();

  beforeEach(() => {
    mem.expenses.clear();
    apiFetchMock.mockReset();
    getTokenMock.mockReset().mockReturnValue("token-1");
    useSyncStore.setState({ pendingCount: 0 });
    syncedSpy.mockClear();
    window.addEventListener(SYNCED_EVENT, syncedSpy);
  });

  afterEach(() => {
    window.removeEventListener(SYNCED_EVENT, syncedSpy);
  });

  it("enqueue: khoản vào hàng đợi, pendingCount cập nhật", async () => {
    // Act
    const entry = await enqueueExpense(makeEntry());

    // Assert
    expect(entry.id).toBeTruthy();
    expect(entry.queuedAt).toBeTruthy();
    const pending = await getPendingExpenses();
    expect(pending).toHaveLength(1);
    expect(pending[0].categoryId).toBe("c1");
    await vi.waitFor(() => expect(useSyncStore.getState().pendingCount).toBe(1));
  });

  it("flush thành công: gỡ khỏi hàng đợi, fire SYNCED_EVENT, payload đúng", async () => {
    // Arrange
    await enqueueExpense(makeEntry({ amount: 100 }));
    await enqueueExpense(makeEntry({ amount: 200 }));
    apiFetchMock.mockResolvedValue({ expense: {} });

    // Act
    const result = await flushQueue();

    // Assert
    expect(result.synced).toBe(2);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/expenses",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({ familyId: "f1", amount: 100 }),
      }),
    );
    expect(await getPendingExpenses()).toHaveLength(0);
    expect(syncedSpy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(useSyncStore.getState().pendingCount).toBe(0));
  });

  it("flush gặp lỗi mạng (status 0): dừng ngay, giữ khoản, không fire event", async () => {
    // Arrange
    await enqueueExpense(makeEntry({ amount: 100 }));
    await enqueueExpense(makeEntry({ amount: 200 }));
    apiFetchMock.mockRejectedValue(new ApiError("NETWORK_ERROR", "mất mạng", 0));

    // Act
    const result = await flushQueue();

    // Assert
    expect(result.synced).toBe(0);
    expect(apiFetchMock).toHaveBeenCalledTimes(1); // dừng ở khoản đầu
    expect(await getPendingExpenses()).toHaveLength(2);
    expect(syncedSpy).not.toHaveBeenCalled();
  });

  it("flush gặp 500: xử lý như lỗi mạng", async () => {
    // Arrange
    await enqueueExpense(makeEntry());
    apiFetchMock.mockRejectedValue(new ApiError("INTERNAL_ERROR", "lỗi server", 500));

    // Act
    const result = await flushQueue();

    // Assert
    expect(result.synced).toBe(0);
    expect(await getPendingExpenses()).toHaveLength(1);
    expect(syncedSpy).not.toHaveBeenCalled();
  });

  it("flush gặp 400: giữ khoản lỗi, tiếp tục khoản sau", async () => {
    // Arrange
    const first = await enqueueExpense(makeEntry({ amount: 100 }));
    await enqueueExpense(makeEntry({ amount: 200 }));
    apiFetchMock
      .mockRejectedValueOnce(new ApiError("VALIDATION_ERROR", "danh mục không tồn tại", 400))
      .mockResolvedValueOnce({ expense: {} });

    // Act
    const result = await flushQueue();

    // Assert
    expect(result.synced).toBe(1);
    const remaining = await getPendingExpenses();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(first.id);
    expect(syncedSpy).toHaveBeenCalledTimes(1);
  });

  it("chưa có access token: không gọi API, giữ nguyên hàng đợi", async () => {
    // Arrange
    getTokenMock.mockReturnValue(null);
    await enqueueExpense(makeEntry());

    // Act
    const result = await flushQueue();

    // Assert
    expect(result.synced).toBe(0);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(await getPendingExpenses()).toHaveLength(1);
  });

  it("gọi flush đồng thời: gộp chung 1 vòng (mỗi khoản gửi đúng 1 lần)", async () => {
    // Arrange
    await enqueueExpense(makeEntry({ amount: 100 }));
    await enqueueExpense(makeEntry({ amount: 200 }));
    let release!: (value: { expense: unknown }) => void;
    apiFetchMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        release = resolve;
      }))
      .mockResolvedValueOnce({ expense: {} });

    // Act
    const p1 = flushQueue();
    const p2 = flushQueue();
    expect(p2).toBe(p1); // cùng 1 promise đang chạy
    // Đợi vòng flush gọi apiFetch khoản đầu (khi đó `release` đã được gán)
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    release({ expense: {} });
    const [r1, r2] = await Promise.all([p1, p2]);

    // Assert
    expect(r1).toEqual(r2);
    expect(r1.synced).toBe(2);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it("isServerUnavailable: 0 và 5xx là true, 4xx và lỗi thường là false", () => {
    // Act + Assert
    expect(isServerUnavailable(new ApiError("NETWORK_ERROR", "m", 0))).toBe(true);
    expect(isServerUnavailable(new ApiError("E", "m", 500))).toBe(true);
    expect(isServerUnavailable(new ApiError("E", "m", 503))).toBe(true);
    expect(isServerUnavailable(new ApiError("E", "m", 400))).toBe(false);
    expect(isServerUnavailable(new Error("lỗi thường"))).toBe(false);
    expect(isServerUnavailable("string")).toBe(false);
  });
});
