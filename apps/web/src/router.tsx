import { Suspense, lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./core/AppShell";
import { RequireAuth } from "./core/RequireAuth";
import { Spinner } from "./shared/ui/Spinner";
import AddPage from "./features/expenses/AddPage";
import EditPage from "./features/expenses/EditPage";
import HomePage from "./features/home/HomePage";
import HistoryPage from "./features/history/HistoryPage";
import MePage from "./features/me/MePage";
import CategoriesPage from "./features/categories/CategoriesPage";
import RentalPage from "./features/rental/RentalPage";
import RentalMonthPage from "./features/rental/RentalMonthPage";
import JoinPage from "./features/auth/JoinPage";
import LoginPage from "./features/auth/LoginPage";
import OnboardingPage from "./features/auth/OnboardingPage";
import RegisterPage from "./features/auth/RegisterPage";

// Stats page kéo recharts (~700 kB) — lazy load để không phình main bundle
const StatsPage = lazy(() => import("./features/stats/StatsPage"));
// Màn thống kê điện/nước phòng trọ — cũng dùng recharts (MeterTrendPanel)
const RentalStatsPage = lazy(() => import("./features/rental/RentalStatsPage"));

function PageFallback() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}

/**
 * Bảng route:
 * - Public: /login, /register, /join
 * - Protected (đi qua RequireAuth):
 *   - /onboarding — màn ngoài shell (user chưa có family)
 *   - 5 màn chính trong AppShell (header + bottom nav)
 *   - /expenses/:id/edit — màn sửa khoản (trong shell, không có trong nav)
 *   - /categories — quản lý danh mục chi tiêu (từ màn Tôi, không có trong nav)
 *   - /rental/stats — thống kê điện/nước phòng trọ (từ màn /rental, lazy)
 */
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/join", element: <JoinPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/onboarding", element: <OnboardingPage /> },
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <HomePage /> },
          {
            path: "/stats",
            element: (
              <Suspense fallback={<PageFallback />}>
                <StatsPage />
              </Suspense>
            ),
          },
          { path: "/add", element: <AddPage /> },
          { path: "/expenses/:id/edit", element: <EditPage /> },
          { path: "/rental", element: <RentalPage /> },
          {
            path: "/rental/stats",
            element: (
              <Suspense fallback={<PageFallback />}>
                <RentalStatsPage />
              </Suspense>
            ),
          },
          { path: "/rental/:month", element: <RentalMonthPage /> },
          { path: "/history", element: <HistoryPage /> },
          { path: "/categories", element: <CategoriesPage /> },
          { path: "/me", element: <MePage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
