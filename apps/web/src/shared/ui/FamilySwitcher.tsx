import { useRef, useState, type FormEvent } from "react";
import type { Family } from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { validateFamilyName, validateInviteCode } from "../../core/familyForm";
import { Button } from "./Button";
import { Input } from "./Input";
import { RoleBadge } from "./RoleBadge";
import { ChevronLeftIcon, PlusIcon, UsersIcon, XIcon } from "./icons";
import { SHEET_EXIT_MS, useDismissTransition } from "./useDismissTransition";

type SwitcherView = "list" | "create" | "join";

const FALLBACK_ERROR = "Có lỗi xảy ra, vui lòng thử lại.";

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : FALLBACK_ERROR;
}

/**
 * Dialog đổi gia đình (bottom sheet): liệt kê toàn bộ family user thuộc,
 * highlight family đang active, `onSelect(id)` khi chọn family khác.
 *
 * Có thêm 2 view form (khi parent truyền callback):
 * - `create`: tạo gia đình mới → `onCreateFamily(name)`
 * - `join`: nhập mã mời → `onJoinFamily(code)`
 * Thành công/lỗi do parent xử lý (callback resolve → parent đóng dialog;
 * reject → component hiện message trong form).
 *
 * Hiệu ứng: slide-up khi mở (`animate-sheet-in`), slide-down khi đóng
 * (`animate-sheet-out`). Parent giữ render liên tục + truyền `open`;
 * component tự unmount sau khi đóng xong (`useDismissTransition`).
 *
 * UI primitive thuần — không inject service, không gọi HTTP.
 */
export function FamilySwitcher({
  open,
  families,
  activeFamilyId,
  onSelect,
  onClose,
  onCreateFamily,
  onJoinFamily,
}: {
  /** Mount/đóng do parent điều khiển (true = đang mở). */
  open: boolean;
  families: Family[];
  activeFamilyId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Không truyền → không hiện nút "Tạo gia đình mới". */
  onCreateFamily?: (name: string) => Promise<void>;
  /** Không truyền → không hiện nút "Join bằng mã mời". */
  onJoinFamily?: (code: string) => Promise<void>;
}) {
  const [view, setView] = useState<SwitcherView>("list");
  const { mounted, closing } = useDismissTransition(open, SHEET_EXIT_MS);

  const [familyName, setFamilyName] = useState("");
  const [code, setCode] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Component luôn mounted (để chạy hiệu ứng đóng) → state form/view có thể
  // sót qua chu kỳ đóng→mở (trước đây parent unmount nên mở lại luôn "mới").
  // Reset NGAY trong render (pattern derive-state) thay vì useEffect — để
  // không flash 1 frame form cũ khi sheet vừa trượt lên.
  const prevOpenRef = useRef(open);
  if (prevOpenRef.current !== open) {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open && !wasOpen) {
      setView("list");
      setFamilyName("");
      setCode("");
      setNameError(null);
      setCodeError(null);
      setSubmitting(false);
    }
  }

  // Pha đóng: parent đã nhận onClose rồi → bỏ qua mọi thao tác đóng lặp lại
  function handleClose() {
    if (open) onClose();
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setNameError(null);
    const nameErr = validateFamilyName(familyName);
    if (nameErr) {
      setNameError(nameErr);
      return;
    }
    setSubmitting(true);
    try {
      await onCreateFamily?.(familyName.trim());
      // Thành công: parent (MePage) đóng dialog + navigate về trang chủ
    } catch (err) {
      setNameError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    setCodeError(null);
    const codeErr = validateInviteCode(code);
    if (codeErr) {
      setCodeError(codeErr);
      return;
    }
    setSubmitting(true);
    try {
      await onJoinFamily?.(code);
    } catch (err) {
      setCodeError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function goBackToList() {
    setView("list");
    setNameError(null);
    setCodeError(null);
  }

  // Tên dialog theo view — screen reader đọc đúng ngữ cảnh (list vs form)
  const dialogLabel =
    view === "create" ? "Tạo gia đình mới" : view === "join" ? "Join bằng mã mời" : "Đổi gia đình";

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-20 flex items-end justify-center modal-backdrop ${
        closing ? "animate-fade-out" : "animate-fade-in"
      }`}
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-label={dialogLabel}
        className={`w-full max-w-md rounded-t-2xl bg-card p-5 ${
          closing ? "animate-sheet-out" : "animate-sheet-in"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {view === "list" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Đổi gia đình</h2>
              <button
                onClick={handleClose}
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
            {(onCreateFamily || onJoinFamily) && (
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                {onCreateFamily && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setView("create")}
                  >
                    <PlusIcon className="h-4 w-4" />
                    Tạo gia đình mới
                  </Button>
                )}
                {onJoinFamily && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setView("join")}
                  >
                    <UsersIcon className="h-4 w-4" />
                    Join bằng mã mời
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {view === "create" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Tạo gia đình mới</h2>
              <button
                onClick={handleClose}
                aria-label="Đóng"
                className="rounded-lg p-1.5 text-ink-muted transition hover:bg-ink/5"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="mt-4">
              <Input
                label="Tên gia đình"
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="Nhà Mình"
                maxLength={50}
                error={nameError}
                autoFocus
              />
              <p className="mt-1.5 text-xs text-ink-muted">
                Bạn sẽ là chủ gia đình và mời thành viên bằng mã.
              </p>
              <div className="mt-4 space-y-2">
                <Button type="submit" className="w-full" loading={submitting}>
                  Tạo gia đình
                </Button>
                {/* Disable khi submit đang bay — tránh đổi view nuốt lỗi + mở
                    khoá button form kia trong khi request vẫn chạy */}
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={submitting}
                  onClick={goBackToList}
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                  Quay lại
                </Button>
              </div>
            </form>
          </>
        )}

        {view === "join" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Join bằng mã mời</h2>
              <button
                onClick={handleClose}
                aria-label="Đóng"
                className="rounded-lg p-1.5 text-ink-muted transition hover:bg-ink/5"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleJoin} className="mt-4">
              <Input
                label="Mã mời"
                type="text"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
                }
                placeholder="ABC123"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                error={codeError}
                className="text-center text-2xl font-bold uppercase tracking-[0.4em]"
                autoFocus
              />
              <p className="mt-1.5 text-xs text-ink-muted">
                Mã 6 ký tự mà chủ gia đình chia sẻ.
              </p>
              <div className="mt-4 space-y-2">
                <Button type="submit" className="w-full" loading={submitting}>
                  Tham gia
                </Button>
                {/* Disable khi submit đang bay — tránh đổi view nuốt lỗi + mở
                    khoá button form kia trong khi request vẫn chạy */}
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={submitting}
                  onClick={goBackToList}
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                  Quay lại
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
