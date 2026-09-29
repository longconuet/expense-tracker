import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../core/authStore";
import { useThemeStore } from "../../core/themeStore";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { FamilySwitcher } from "../../shared/ui/FamilySwitcher";
import { RoleBadge } from "../../shared/ui/RoleBadge";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  LogoutIcon,
  MoonIcon,
  RefreshIcon,
  SunIcon,
  TagIcon,
  UsersIcon,
} from "../../shared/ui/icons";
import { useInstallPrompt } from "./useInstallPrompt";
import { useSwUpdate } from "./useSwUpdate";

/**
 * Màn "Tôi": thông tin tài khoản, giao diện tối, family đang active
 * (bấm để đổi family + mã mời + copy) và đăng xuất. Có bản cập nhật PWA
 * mới → hiện nút "Cập nhật ngay" ở đầu màn. Tên family + đổi family và
 * tên tài khoản đã chuyển về đây từ header (AppShell).
 */
export default function MePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const families = useAuthStore((s) => s.families);
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);
  const setActiveFamily = useAuthStore((s) => s.setActiveFamily);
  const createFamily = useAuthStore((s) => s.createFamily);
  const joinFamily = useAuthStore((s) => s.joinFamily);
  const logout = useAuthStore((s) => s.logout);

  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const { canInstall, promptInstall } = useInstallPrompt();
  const { updateAvailable, applying, applyUpdate } = useSwUpdate();

  const [copied, setCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const activeFamily = families.find((f) => f.id === activeFamilyId) ?? families[0];

  function handleSelectFamily(id: string) {
    setActiveFamily(id);
    setSwitcherOpen(false);
  }

  // Tạo/join family thêm: store tự append + set activeFamilyId về family mới.
  // Thành công → đóng dialog + về trang chủ (khớp hành vi onboarding).
  // Lỗi throw lên FamilySwitcher hiển thị trong form.
  async function handleCreateFamily(name: string) {
    await createFamily(name);
    setSwitcherOpen(false);
    navigate("/", { replace: true });
  }

  async function handleJoinFamily(code: string) {
    await joinFamily(code);
    setSwitcherOpen(false);
    navigate("/", { replace: true });
  }

  async function handleCopyCode() {
    if (!activeFamily) return;
    try {
      await navigator.clipboard.writeText(activeFamily.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Môi trường không cho clipboard (non-secure context) — mã mời hiển thị
      // sẵn trong card, user chọn text để copy tay
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Tôi</h1>

      {updateAvailable && (
        <Card role="status" className="mt-4 border border-primary/40">
          <div className="flex items-center gap-3">
            <RefreshIcon className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-ink">Có bản cập nhật mới</p>
              <p className="text-xs text-ink-muted">
                Cập nhật để dùng phiên bản mới nhất của ứng dụng.
              </p>
            </div>
          </div>
          <Button className="mt-3 w-full" onClick={applyUpdate} loading={applying}>
            Cập nhật ngay
          </Button>
        </Card>
      )}

      <Card className="mt-4">
        <p className="text-lg font-semibold text-ink">{user?.name}</p>
        <p className="text-sm text-ink-muted">{user?.username}</p>
      </Card>

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === "dark" ? (
              <MoonIcon className="h-5 w-5 text-primary" />
            ) : (
              <SunIcon className="h-5 w-5 text-primary" />
            )}
            <div>
              <p className="font-medium text-ink">Giao diện tối</p>
              <p className="text-xs text-ink-muted">
                {theme === "dark" ? "Đang bật" : "Đang tắt"}
              </p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={theme === "dark"}
            aria-label="Đổi giao diện tối"
            onClick={toggleTheme}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${
              theme === "dark" ? "bg-primary" : "bg-ink/20"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
                theme === "dark" ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </Card>

      {activeFamily && (
        <Card className="mt-4">
          {/* Bấm vào phần thông tin family để mở dialog đổi family.
              aria-label đủ meta (thành viên/chủ) vì content của button
              bị AT bỏ qua — SR vẫn đọc đầy đủ thông tin. */}
          <button
            type="button"
            onClick={() => setSwitcherOpen(true)}
            aria-label={`Đổi gia đình (đang ở ${activeFamily.name} · ${activeFamily.memberCount} thành viên · chủ ${activeFamily.ownerName})`}
            aria-haspopup="dialog"
            aria-expanded={switcherOpen}
            className="flex w-full items-start justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5 shrink-0 text-ink-muted" />
              <div className="text-left">
                <p className="font-semibold text-ink">{activeFamily.name}</p>
                <p className="text-xs text-ink-muted">
                  {activeFamily.memberCount} thành viên · chủ: {activeFamily.ownerName}
                </p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
              <RoleBadge role={activeFamily.myRole} />
              <ChevronDownIcon className="h-4 w-4 text-ink-muted" />
            </span>
          </button>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-surface px-3 py-2.5">
            <div>
              <p className="text-xs text-ink-muted">Mã mời gia đình</p>
              <p className="font-mono text-lg font-bold tracking-[0.3em] text-ink">
                {activeFamily.inviteCode}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleCopyCode}>
              {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
              {copied ? "Đã copy" : "Copy"}
            </Button>
          </div>
        </Card>
      )}

      {activeFamily && switcherOpen && (
        <FamilySwitcher
          families={families}
          activeFamilyId={activeFamily.id}
          onSelect={handleSelectFamily}
          onClose={() => setSwitcherOpen(false)}
          onCreateFamily={handleCreateFamily}
          onJoinFamily={handleJoinFamily}
        />
      )}

      {activeFamily && (
        <Card className="mt-4">
          <button
            type="button"
            onClick={() => navigate("/categories")}
            className="flex w-full items-center justify-between"
          >
            <span className="flex items-center gap-3">
              <TagIcon className="h-5 w-5 text-ink-muted" />
              <span className="font-medium text-ink">Danh mục chi tiêu</span>
            </span>
            <ChevronRightIcon className="h-5 w-5 text-ink-muted" />
          </button>
        </Card>
      )}

      {canInstall && (
        <div className="mt-4">
          <Button variant="secondary" size="lg" className="w-full" onClick={promptInstall}>
            <DownloadIcon className="h-5 w-5" />
            Cài ứng dụng
          </Button>
        </div>
      )}

      <div className="mt-4">
        <Button
          variant="danger"
          size="lg"
          className="w-full"
          onClick={() => setConfirmLogout(true)}
          loading={loggingOut}
        >
          <LogoutIcon className="h-5 w-5" />
          Đăng xuất
        </Button>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title="Đăng xuất"
        message="Đăng xuất khỏi ứng dụng?"
        confirmLabel="Đăng xuất"
        danger
        loading={loggingOut}
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
