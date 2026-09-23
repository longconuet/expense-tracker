import type { Category } from "@expense-tracker/shared";
import { create } from "zustand";
import { ApiError, apiFetch, getAccessToken } from "./api";
import { idbDelete, idbGetAll, idbPut } from "./db";

/**
 * Hàng đợi offline: khoản chi nhập khi server không đạt được (lỗi mạng/5xx)
 * được lưu IndexedDB, tự gửi lại khi server hoạt động.
 */

export interface QueuedExpense {
  id: string;
  familyId: string;
  categoryId: string;
  /** Snapshot tên/icon — hiển thị + sync không phụ thuộc danh mục còn tồn tại. */
  category: Pick<Category, "name" | "icon">;
  amount: number;
  date: string;
  note: string | null;
  queuedAt: string;
}

export type NewQueuedExpense = Omit<QueuedExpense, "id" | "queuedAt">;

export const SYNCED_EVENT = "etracker:expenses-synced";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Server không đạt được (lỗi mạng hoặc 5xx) — chấp nhận ghi offline. */
export function isServerUnavailable(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || err.status >= 500);
}

export async function enqueueExpense(input: NewQueuedExpense): Promise<QueuedExpense> {
  const entry: QueuedExpense = {
    ...input,
    id: newId(),
    queuedAt: new Date().toISOString(),
  };
  await idbPut("expenses", entry);
  void useSyncStore.getState().bump();
  return entry;
}

/** Khoản đang chờ, thứ tự nhập trước — gửi trước. */
export async function getPendingExpenses(): Promise<QueuedExpense[]> {
  const items = await idbGetAll<QueuedExpense>("expenses");
  return items.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

let flushing: Promise<{ synced: number }> | null = null;

/**
 * Gửi hàng đợi lên server (trùng gọi đồng thời gộp chung 1 vòng flush duy nhất).
 * - Thành công: gỡ khỏi hàng đợi
 * - Lỗi mạng/5xx: dừng ngay (mạng chưa về) — giữ nguyên các khoản còn lại
 * - 4xx (VD danh mục không còn tồn tại): giữ khoản đó, tiếp tục khoản sau
 * Sync ≥ 1 khoản thành công → fire event SYNCED_EVENT để các màn refetch.
 */
export function flushQueue(): Promise<{ synced: number }> {
  if (!flushing) {
    flushing = doFlush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

async function doFlush(): Promise<{ synced: number }> {
  if (!getAccessToken()) return { synced: 0 }; // chưa đăng nhập — chờ có phiên

  let pending: QueuedExpense[];
  try {
    pending = await getPendingExpenses();
  } catch {
    return { synced: 0 }; // IndexedDB không khả dụng — không có gì để sync
  }
  let synced = 0;

  for (const entry of pending) {
    try {
      await apiFetch<{ expense: unknown }>("/api/expenses", {
        method: "POST",
        body: {
          familyId: entry.familyId,
          categoryId: entry.categoryId,
          amount: entry.amount,
          date: entry.date,
          note: entry.note ?? undefined,
        },
      });
      await idbDelete("expenses", entry.id);
      synced += 1;
    } catch (err) {
      if (isServerUnavailable(err)) break; // mạng chưa về — dừng vòng flush
      // 4xx: giữ khoản trong hàng đợi, thử khoản tiếp theo
    }
  }

  if (synced > 0) {
    window.dispatchEvent(new Event(SYNCED_EVENT));
  }
  void useSyncStore.getState().bump();
  return { synced };
}

interface SyncState {
  pendingCount: number;
  /** Đếm lại khoản chờ (gọi sau enqueue/flush). */
  bump: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set) => ({
  pendingCount: 0,
  bump: async () => {
    try {
      const pending = await getPendingExpenses();
      set({ pendingCount: pending.length });
    } catch {
      // IndexedDB không khả dụng — giữ số đếm cũ
    }
  },
}));
