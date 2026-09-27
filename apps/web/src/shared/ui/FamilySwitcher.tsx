import type { Family } from "@expense-tracker/shared";
import { RoleBadge } from "./RoleBadge";
import { XIcon } from "./icons";

/**
 * Dialog đổi gia đình (bottom sheet): liệt kê toàn bộ family user thuộc,
 * highlight family đang active, `onSelect(id)` khi chọn family khác.
 * UI primitive thuần — parent tự quản lý trạng thái mở/đóng và xử lý chọn.
 */
export function FamilySwitcher({
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
      className="fixed inset-0 z-20 flex items-end justify-center modal-backdrop"
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
