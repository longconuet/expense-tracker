import type { ComponentType, SVGProps } from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import {
  ChartIcon,
  HistoryIcon,
  HomeIcon,
  PlusIcon,
  UserIcon,
} from "../shared/ui/icons";
import { useAuthStore } from "./authStore";
import { useCacheStatus } from "./cacheStatus";
import { formatTimeShort } from "./dates";
import { useOnline } from "./useOnline";
import { useSyncStore } from "./syncQueue";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** NavLink khớp đúng path (không khớp tiền tố). */
  end?: boolean;
  /** Nút lớn tròn ở giữa. */
  center?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Trang chủ", icon: HomeIcon, end: true },
  { to: "/stats", label: "Thống kê", icon: ChartIcon },
  { to: "/add", label: "Thêm", icon: PlusIcon, center: true },
  { to: "/history", label: "Lịch sử", icon: HistoryIcon },
  { to: "/me", label: "Tôi", icon: UserIcon },
];

/**
 * Shell cho các màn chính: bottom nav + banner trạng thái (offline /
 * máy chủ không phản hồi + dữ liệu lưu lúc HH:mm / khoản chờ đồng bộ).
 * Tên family và tên tài khoản KHÔNG còn ở header — hiển thị
 * và đổi family tại card trên tab "Tôi". Header chỉ render khi có banner.
 *
 * PWA iOS (standalone, viewport-fit=cover): iOS phủ lớp frosted-glass lên
 * vùng status bar — root có `pt-[env(safe-area-inset-top)]` để nội dung
 * không nằm dưới lớp đó, banner sticky neo `top-[env(safe-area-inset-top)]`
 * khi cuộn. `main` có `pt-6` (thay pt-4) để khoảng hở trên cao hơn một
 * chút, tách nội dung khỏi dải mờ. Cạnh dưới giữ sát mép màn như thiết kế
 * cũ (user không muốn thêm khoảng trắng cho home indicator).
 * Trên desktop/browser thường env() = 0.
 */
export function AppShell() {
  const families = useAuthStore((s) => s.families);
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const servedFromCacheAt = useCacheStatus((s) => s.servedFromCacheAt);
  const online = useOnline();

  const activeFamily = families.find((f) => f.id === activeFamilyId) ?? families[0] ?? null;

  if (!activeFamily) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-surface pt-[env(safe-area-inset-top)]">
      {(!online || servedFromCacheAt !== null || pendingCount > 0) && (
        <header className="sticky top-[env(safe-area-inset-top)] z-10 border-b border-border bg-surface/95 backdrop-blur">
          {!online && (
            <p className="border-t border-border bg-danger/10 px-4 py-1.5 text-center text-xs font-medium text-danger">
              {`Không có mạng — đang xem dữ liệu lưu trước${
                servedFromCacheAt !== null ? ` lúc ${formatTimeShort(servedFromCacheAt)}` : ""
              }`}
            </p>
          )}
          {online && servedFromCacheAt !== null && (
            <p className="border-t border-border bg-danger/10 px-4 py-1.5 text-center text-xs font-medium text-danger">
              {`Máy chủ không phản hồi — đang xem dữ liệu lưu lúc ${formatTimeShort(
                servedFromCacheAt,
              )}`}
            </p>
          )}
          {pendingCount > 0 && (
            <p className="border-t border-border bg-primary-soft/60 px-4 py-1.5 text-center text-xs font-medium text-primary">
              {pendingCount} khoản chi đang chờ đồng bộ khi có mạng
            </p>
          )}
        </header>
      )}

      <main className="flex-1 px-4 pb-28 pt-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card">
        <div className="mx-auto flex max-w-md items-end justify-around px-2 py-1.5">
          {NAV_ITEMS.map((item) => {
            const ItemIcon = item.icon;
            if (item.center) {
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  aria-label={item.label}
                  className="flex h-14 w-14 -translate-y-3 items-center justify-center rounded-full bg-primary text-white shadow-lg transition hover:bg-primary/90"
                >
                  <ItemIcon className="h-7 w-7" />
                </NavLink>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex w-14 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
                    isActive ? "text-primary" : "text-ink-muted hover:text-ink"
                  }`
                }
              >
                <ItemIcon className="h-5 w-5" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
