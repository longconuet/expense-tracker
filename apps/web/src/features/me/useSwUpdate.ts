import { useCallback, useEffect, useState } from "react";
import { applySwUpdate, hasPendingUpdate, requestSwUpdateCheck } from "../../core/swUpdate";

/**
 * Trạng thái cập nhật PWA cho màn "Tôi":
 * - Khi màn mở: kiểm tra chủ động (`requestSwUpdateCheck` — gọi
 *   `reg.update()`) + sẵn sàng nhận sự kiện `controllerchange` (SW mới
 *   nhận quyền điều khiển = có bản cập nhật mới).
 * - Có bản mới → `updateAvailable = true` → MePage hiện nút "Cập nhật
 *   ngay". Bấm nút → `applySwUpdate` (reload trang để tải bản mới).
 */
export function useSwUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    // Kiểm tra ban đầu (phòng controller đã đổi trước khi màn mở)
    setUpdateAvailable(hasPendingUpdate());
    // Sự kiện chính: SW mới activate + claim → trang đang chạy bản cũ
    const onControllerChange = () => setUpdateAvailable(hasPendingUpdate());
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    // Kiểm tra chủ động phiên bản mới (điều kiện để controller đổi)
    void requestSwUpdateCheck();
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  const applyUpdate = useCallback(async () => {
    setApplying(true);
    try {
      await applySwUpdate();
    } finally {
      // Thường trang đã reload; reset cho trường hợp không reload được
      // (môi trường không hỗ trợ SW, lỗi bất ngờ...).
      setApplying(false);
    }
  }, []);

  return { updateAvailable, applying, applyUpdate };
}
