import { create } from "zustand";

/**
 * Trạng thái "đang xem dữ liệu lưu" — readCache set khi phải trả bản cache
 * offline (server không đạt được). AppShell dùng để hiện banner kèm giờ lưu.
 */

/**
 * clear() chỉ xoá mark cũ hơn ngưỡng này — tránh 2 fetch song song của 1 trang
 * (1 OK + 1 fallback) làm banner tắt nhầm khi dữ liệu fallback vẫn đang hiển thị.
 */
const CLEAR_GUARD_MS = 2000;

interface CacheStatusState {
  /** Thời điểm (ISO) của bản cache vừa được dùng để trả dữ liệu; null = chưa. */
  servedFromCacheAt: string | null;
  markServed: (savedAt: string) => void;
  clear: () => void;
}

export const useCacheStatus = create<CacheStatusState>((set) => ({
  servedFromCacheAt: null,
  markServed: (savedAt) => set({ servedFromCacheAt: savedAt }),
  clear: () =>
    set((state) => {
      const markedAt = state.servedFromCacheAt;
      if (markedAt !== null && Date.now() - Date.parse(markedAt) < CLEAR_GUARD_MS) {
        return state; // mark còn mới — giữ, fetch fallback song song có thể vừa set
      }
      return { servedFromCacheAt: null };
    }),
}));
