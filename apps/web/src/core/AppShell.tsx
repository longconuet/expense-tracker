import { useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import type { Family } from "@expense-tracker/shared";
import {
  ChartIcon,
  ChevronDownIcon,
  HistoryIcon,
  HomeIcon,
  PlusIcon,
  UserIcon,
  XIcon,
} from "../shared/ui/icons";
import { RoleBadge } from "../shared/ui/RoleBadge";
import { useAuthStore } from "./authStore";
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

function FamilySwitcher({
  families,
  activeFamilyId,
  onSelect,
  onClose,
}: {
  families: Family[];
  activeFamilyId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Đổi gia đình"
        className="w-full max-w-md rounded-t-2xl bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Đổi gia đình</h2>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-ink-muted transition hover:bg-ink/5"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {families.map((family) => (
            <li key={family.id}>
              <button
                onClick={() => onSelect(family.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                  family.id === activeFamilyId
                    ? "border-primary bg-primary-soft/50"
                    : "border-border bg-surface hover:border-primary/50"
                }`}
              >
                <div>
                  <p className="font-medium text-ink">{family.name}</p>
                  <p className="text-xs text-ink-muted">
                    {family.memberCount} thành viên · {family.ownerName}
                  </p>
                </div>
                <RoleBadge role={family.myRole} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Shell cho các màn chính: header (tên family + đổi family) + bottom nav.
 * User đã đăng nhập nhưng chưa thuộc family nào → chuyển /onboarding.
 */
export function AppShell() {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const families = useAuthStore((s) => s.families);
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);
  const setActiveFamily = useAuthStore((s) => s.setActiveFamily);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const online = useOnline();

  const activeFamily = families.find((f) => f.id === activeFamilyId) ?? families[0] ?? null;

  if (!activeFamily) {
    return <Navigate to="/onboarding" replace />;
  }

  function handleSelectFamily(id: string) {
    setActiveFamily(id);
    setSwitcherOpen(false);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-surface">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setSwitcherOpen(true)}
            aria-label={`Đổi gia đình (đang ở ${activeFamily.name})`}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition hover:bg-ink/5"
          >
            <span className="max-w-40 truncate font-semibold text-ink">{activeFamily.name}</span>
            <ChevronDownIcon className="h-4 w-4 text-ink-muted" />
          </button>
          <span className="truncate text-sm text-ink-muted" title={user?.username}>
            {user?.name}
          </span>
        </div>
        {!online && (
          <p className="border-t border-border bg-danger/10 px-4 py-1.5 text-center text-xs font-medium text-danger">
            Không có mạng — đang xem dữ liệu lưu trước
          </p>
        )}
        {pendingCount > 0 && (
          <p className="border-t border-border bg-primary-soft/60 px-4 py-1.5 text-center text-xs font-medium text-primary">
            {pendingCount} khoản chi đang chờ đồng bộ khi có mạng
          </p>
        )}
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
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

      {switcherOpen && (
        <FamilySwitcher
          families={families}
          activeFamilyId={activeFamily.id}
          onSelect={handleSelectFamily}
          onClose={() => setSwitcherOpen(false)}
        />
      )}
    </div>
  );
}
