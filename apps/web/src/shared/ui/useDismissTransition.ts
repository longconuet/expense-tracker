import { useEffect, useState } from "react";

/** Thời lượng hiệu ứng đóng của modal giữa màn (khớp keyframes ở index.css). */
export const MODAL_EXIT_MS = 150;
/** Thời lượng hiệu ứng đóng của bottom sheet (trượt xuống → dài hơn chút). */
export const SHEET_EXIT_MS = 180;

export interface DismissTransitionState {
  /** Còn mounted — true cả trong pha hiệu ứng đóng sau khi `open` → false. */
  mounted: boolean;
  /** Đang trong pha đóng — dùng để gắn class `animate-*-out`. */
  closing: boolean;
}

/**
 * Giữ component mounted thêm `exitMs` sau khi `open` chuyển false, để hiệu
 * ứng đóng (exit animation) chạy xong trước khi unmount.
 *
 * - `open` = true  → `{ mounted: true, closing: false }` (chạy hiệu ứng mở)
 * - `open` = false → `{ closing: true }` trong `exitMs`, rồi unmount.
 *
 * Cách dùng: PARENT giữ render component liên tục và truyền `open`; chính
 * component tự quyết định thời điểm unmount. Modal + FamilySwitcher dùng
 * hook này.
 */
export function useDismissTransition(open: boolean, exitMs: number): DismissTransitionState {
  const [state, setState] = useState<DismissTransitionState>({
    mounted: open,
    closing: false,
  });

  useEffect(() => {
    if (open) {
      // Mở (hoặc mở lại trong lúc đang đóng) → vào pha enter ngay.
      setState((s) => (s.mounted && !s.closing ? s : { mounted: true, closing: false }));
      return;
    }
    // Chưa mounted (mặc định render với open=false) → không cần chạy exit.
    if (!state.mounted) return;
    setState((s) => (s.mounted ? { ...s, closing: true } : s));
    const timer = window.setTimeout(() => {
      setState({ mounted: false, closing: false });
    }, exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs, state.mounted]);

  return state;
}
