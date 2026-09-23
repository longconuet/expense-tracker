import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { setSessionExpiredHandler } from "./core/api";
import { useAuthStore } from "./core/authStore";
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

  // Khôi phục phiên khi tải trang (token in-memory + refresh cookie) — chạy 1 lần
  useEffect(() => {
    void useAuthStore.getState().bootstrap();
  }, []);

  // Đồng bộ hàng đợi offline (đếm khoản chờ + tự sync khi có lại mạng) — chạy 1 lần
  useEffect(() => {
    initSync();
  }, []);

  return <RouterProvider router={router} />;
}
