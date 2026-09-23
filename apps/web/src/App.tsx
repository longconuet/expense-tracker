import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { setSessionExpiredHandler } from "./core/api";
import { useAuthStore } from "./core/authStore";
import { flushQueue } from "./core/syncQueue";
import { initSync } from "./core/syncManager";
import { router } from "./router";

export default function App() {
  // Đăng ký handler "mất phiên" (refresh fail) — nơi duy nhất có router để điều hướng
  useEffect(() => {
    setSessionExpiredHandler(() => {
      useAuthStore.getState().clearSession();
      router.navigate("/login", { replace: true });
    });
  }, []);

  // Khôi phục phiên khi tải trang + đồng bộ hàng đợi offline.
  // Flush ban đầu chạy SAU bootstrap: access token in-memory chỉ tồn tại sau khi
  // refresh xong — flush trước bootstrap thì doFlush bỏ qua (chưa có phiên) và
  // khoản chờ phải đợi tới interval 30s mới sync. Listener online/interval vẫn
  // đăng ký ngay trong initSync (doFlush tự guard khi chưa có token).
  useEffect(() => {
    initSync();
    void useAuthStore.getState().bootstrap().then(() => {
      void flushQueue();
    });
  }, []);

  return <RouterProvider router={router} />;
}
