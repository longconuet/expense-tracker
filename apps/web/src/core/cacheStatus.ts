import { create } from "zustand";

/**
 * Trạng thái "đang xem dữ liệu lưu" — readCache set khi phải trả bản cache
 * offline (server không đạt được). AppShell dùng để hiện banner kèm giờ lưu.
 */

/**
 * clear() không force chỉ xoá mark cũ hơn ngưỡng này — tránh 2 fetch song song
 * của 1 trang (1 OK + 1 fallback) làm banner tắt nhầm khi dữ liệu fallback
 * vẫn đang hiển thị. Guard dùng `markedAt` (lúc set mark), KHÔNG dùng
 * `servedFromCacheAt` (savedAt của entry — luôn già hơn nhiều).
 */
const CLEAR_GUARD_MS = 2000;

interface CacheStatusState {
  /**
   * Thời điểm (ISO) của bản cache vừa được dùng để trả dữ liệu —
   * chỉ để hiển thị giờ "dữ liệu lưu lúc HH:mm"; null = chưa.
   */
  servedFromCacheAt: string | null;
  /** Thời điểm (ms epoch) markServed được gọi — cơ sở cho guard 2s. */
  markedAt: number | null;
  markServed: (savedAt: string) => void;
  /** @param force Bỏ qua guard — dùng khi đổi trang (màn mới tự mark lại nếu cũng fallback). */
  clear: (force?: boolean) => void;
}

export const useCacheStatus = create<CacheStatusState>((set) => ({
  servedFromCacheAt: null,
  markedAt: null,
  markServed: (savedAt) => set({ servedFromCacheAt: savedAt, markedAt: Date.now() }),
  clear: (force = false) =>
    set((state) => {
      if (!force && state.markedAt !== null && Date.now() - state.markedAt < CLEAR_GUARD_MS) {
        return state; // mark còn mới — giữ, fetch fallback song song có thể vừa set
      }
      return { servedFromCacheAt: null, markedAt: null };
    }),
}));
