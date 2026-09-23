import { flushQueue, useSyncStore } from "./syncQueue";

const RETRY_INTERVAL_MS = 30_000;

let started = false;

/**
 * Đăng ký các trigger đồng bộ hàng đợi offline (gọi 1 lần từ App):
 * - Khởi động app: đếm khoản chờ + thử flush
 * - Event "online": flush ngay
 * - Mỗi 30s khi còn khoản chờ — cover trường hợp thiết bị vẫn "online"
 *   nhưng server đang down (VD proxy trả 500), event "online" không bao giờ fired
 */
export function initSync(): void {
  if (started) return;
  started = true;

  void useSyncStore.getState().bump();
  void flushQueue();

  window.addEventListener("online", () => {
    void flushQueue();
  });
  window.setInterval(() => {
    if (useSyncStore.getState().pendingCount > 0) {
      void flushQueue();
    }
  }, RETRY_INTERVAL_MS);
}
