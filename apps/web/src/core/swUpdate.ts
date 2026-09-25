/**
 * Kiểm tra + áp dụng bản cập nhật PWA (vite-plugin-pwa — SW sinh ra có
 * `skipWaiting()` + `clientsClaim()`, xem dist/sw.js):
 *
 * Khi có deploy mới, nội dung /sw.js đổi. Gọi `reg.update()` chủ động →
 * trình duyệt cài SW mới → SW mới activate ngay (skipWaiting) và nhận
 * quyền điều khiển trang (clientsClaim) → phát sự kiện `controllerchange`.
 * Lúc này trang VẪN chạy code bản cũ → cần reload để tải assets phiên bản mới.
 *
 * `initialController` = SW đang điều khiển trang lúc app khởi động (chụp
 * sẵn khi module nạp): controller hiện tại khác nó → có bản cập nhật.
 * Lần ghé đầu (chưa có controller lúc khởi động) không bao giờ báo "có
 * cập nhật" — assets trang lúc đó đã là bản mới nhất từ network.
 */

const sw: ServiceWorkerContainer | undefined =
  typeof navigator !== "undefined" && "serviceWorker" in navigator
    ? navigator.serviceWorker
    : undefined;

const initialController: ServiceWorker | null = sw?.controller ?? null;

/** True khi SW MỚI đã nhận quyền điều khiển (khác SW lúc app khởi động). */
export function hasPendingUpdate(): boolean {
  return Boolean(
    sw && initialController && sw.controller && sw.controller !== initialController,
  );
}

/**
 * Kiểm tra chủ động phiên bản mới: gọi `reg.update()` (conditional GET
 * sw.js — rất nhẹ). Nếu có bản mới, SW mới sẽ tự activate + claim và
 * `hasPendingUpdate()` chuyển sang true (gọi lại sau sự kiện
 * `controllerchange`). Lỗi mạng/offline/chưa có registration → no-op.
 */
export async function requestSwUpdateCheck(): Promise<void> {
  if (!sw) return;
  try {
    const reg = await sw.getRegistration();
    if (reg) await reg.update();
  } catch {
    // offline / chưa đăng ký SW — bỏ qua
  }
}

/**
 * Áp dụng bản mới: trang hiện tại đã do SW mới điều khiển (đó là điều kiện
 * để nút cập nhật hiện ra) nên reload là đủ — reload sẽ do SW mới serve
 * assets phiên bản mới. Chờ thêm: nếu vẫn còn worker đang
 * installing/activating (edge case), đợi nó xong (tối đa 5s) trước khi
 * reload để chắc chắn lấy đúng bản mới.
 */
export async function applySwUpdate(): Promise<void> {
  if (!sw) return;
  const reg = await sw.getRegistration().catch(() => undefined);
  const worker = reg?.waiting ?? reg?.installing ?? null;
  if (worker && worker.state !== "activated" && worker.state !== "redundant") {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
      const onChange = () => {
        if (worker.state === "activated" || worker.state === "redundant") {
          clearTimeout(timer);
          worker.removeEventListener("statechange", onChange);
          resolve();
        }
      };
      worker.addEventListener("statechange", onChange);
    });
  }
  window.location.reload();
}
