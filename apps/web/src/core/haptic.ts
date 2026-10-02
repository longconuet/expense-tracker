/**
 * Haptic feedback (rung) — chỉ chạy trên thiết bị hỗ trợ (mobile).
 * Desktop/trình duyệt không có `navigator.vibrate` → no-op im lặng.
 */
export function haptic(pattern: number | number[] = 10): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Trình duyệt chặn vibrate (VD desktop) — bỏ qua
    }
  }
}
