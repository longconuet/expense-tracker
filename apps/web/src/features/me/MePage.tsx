import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../core/authStore";
import { useThemeStore } from "../../core/themeStore";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { RoleBadge } from "../../shared/ui/RoleBadge";
import { CheckIcon, ChevronRightIcon, CopyIcon, DownloadIcon, LogoutIcon, MoonIcon, SunIcon, TagIcon, UsersIcon } from "../../shared/ui/icons";
import { useInstallPrompt } from "./useInstallPrompt";

/**
 * Màn "Tôi": thông tin tài khoản, giao diện tối, gia đình hiện tại
 * (mã mời + copy) và đăng xuất.
 */
export default function MePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const families = useAuthStore((s) => s.families);
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);
  const logout = useAuthStore((s) => s.logout);

  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const { canInstall, promptInstall } = useInstallPrompt();

  const [copied, setCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const activeFamily = families.find((f) => f.id === activeFamilyId);

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

      <Card className="mt-4">
        <p className="text-lg font-semibold text-ink">{user?.name}</p>
        <p className="text-sm text-ink-muted">{user?.email}</p>
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
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5 text-ink-muted" />
              <div>
                <p className="font-semibold text-ink">{activeFamily.name}</p>
                <p className="text-xs text-ink-muted">
                  {activeFamily.memberCount} thành viên · chủ: {activeFamily.ownerName}
                </p>
              </div>
            </div>
            <RoleBadge role={activeFamily.myRole} />
          </div>

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
