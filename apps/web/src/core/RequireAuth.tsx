import { Navigate, Outlet } from "react-router-dom";
import { FullPageSpinner } from "../shared/ui/Spinner";
import { useAuthStore } from "./authStore";

/**
 * Guard các route cần đăng nhập:
 * - bootstrapping: loading toàn màn (đang khôi phục phiên từ refresh cookie)
 * - guest: chuyển về /login
 * - authenticated: render route con
 */
export function RequireAuth() {
  const status = useAuthStore((s) => s.status);

  if (status === "bootstrapping") {
    return <FullPageSpinner />;
  }

  if (status === "guest") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
