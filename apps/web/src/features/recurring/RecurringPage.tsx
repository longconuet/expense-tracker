import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  describeRecurringEnd,
  formatVnd,
  type RecurringRule,
} from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { fetchRecurring, materializeRecurring } from "../../core/dataApi";
import { shortDate } from "../../core/dates";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { PlusIcon, RepeatIcon } from "../../shared/ui/icons";
import { Skeleton } from "../../shared/ui/Skeleton";

/**
 * Màn "Giao dịch định kỳ" — list rule (spec: docs/spec-recurring.md §4.3).
 *
 * Khi mount (online): gọi `materializeRecurring` TRƯỚC khi đọc list — sinh
 * khoản quá hạn của mọi rule active để "Kỳ tới" luôn tươi (silent, lỗi mạng
 * bỏ qua — AppShell cũng tự trigger materialize khi mở app/đổi family).
 *
 * Quyền: OWNER chạm card → màn sửa; MEMBER chỉ xem (card không chạm, không
 * có nút tạo). Nút "Tạo giao dịch định kỳ" (chỉ OWNER) nằm DƯỚI TIÊU ĐỀ,
 * LUÔN thấy dù list rỗng hay đã có rule (pattern `CategoriesPage`) — tránh
 * user không tạo thêm được rule khi list không rỗng.
 */
export default function RecurringPage() {
  const navigate = useNavigate();
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);
  const myRole = useAuthStore((s) => {
    const family = s.families.find((f) => f.id === s.activeFamilyId) ?? s.families[0];
    return family?.myRole ?? null;
  });
  const isOwner = myRole === "OWNER";

  const [rules, setRules] = useState<RecurringRule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!activeFamilyId) return;
    let cancelled = false;
    setLoadError(null);
    setRules(null);

    (async () => {
      try {
        // Sinh khoản quá hạn trước — silent (lỗi mạng/server bỏ qua)
        if (navigator.onLine) {
          await materializeRecurring(activeFamilyId).catch(() => undefined);
        }
        const data = await fetchRecurring(activeFamilyId);
        if (!cancelled) setRules(data.rules);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError ? err.message : "Không tải được danh sách giao dịch định kỳ.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeFamilyId, reloadKey]);

  if (!activeFamilyId) {
    return <p className="text-ink-muted">Chưa có gia đình để xem giao dịch định kỳ.</p>;
  }

  if (loadError) {
    return (
      <div className="py-16 text-center">
        <p role="alert" className="text-sm font-medium text-danger">
          {loadError}
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>
          Thử lại
        </Button>
      </div>
    );
  }

  if (!rules) {
    return (
      <div>
        <h1 className="text-xl font-bold text-ink">Giao dịch định kỳ</h1>
        {isOwner && (
          <div className="mt-4">
            <Button className="w-full" disabled onClick={() => navigate("/recurring/new")}>
              <PlusIcon className="h-5 w-5" />
              Tạo giao dịch định kỳ
            </Button>
          </div>
        )}
        <div role="status" aria-label="Đang tải" className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Giao dịch định kỳ</h1>

      {isOwner && (
        <div className="mt-4">
          <Button className="w-full" onClick={() => navigate("/recurring/new")}>
            <PlusIcon className="h-5 w-5" />
            Tạo giao dịch định kỳ
          </Button>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <RepeatIcon className="h-12 w-12 text-ink-muted/50" />
          <p className="mt-4 font-medium text-ink">Chưa có giao dịch định kỳ</p>
          <p className="mt-1 text-sm text-ink-muted">
            Thiết lập một lần — ứng dụng tự ghi khoản mỗi tháng.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {rules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} isOwner={isOwner} onOpen={() => navigate(`/recurring/${rule.id}`)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  isOwner,
  onOpen,
}: {
  rule: RecurringRule;
  isOwner: boolean;
  onOpen: () => void;
}) {
  // COUNT hiện tiến độ "1/3 lần" thay vì "3 lần"; FOREVER/UNTIL_DATE dùng 1 nguồn shared
  const endLabel =
    rule.endType === "COUNT"
      ? `${rule.generatedCount}/${rule.occurrenceCount ?? 0} lần`
      : describeRecurringEnd(rule.endType, rule.endDate, rule.occurrenceCount);

  const inner = (
    <>
      {/* Dòng 1: icon danh mục + tên + số tiền */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="text-2xl">
            {rule.category.icon}
          </span>
          <span className="truncate font-medium text-ink">{rule.category.name}</span>
        </div>
        <span className="shrink-0 font-semibold text-ink tabular-nums">
          {formatVnd(rule.amount)}
        </span>
      </div>

      {/* Dòng 2: tần suất + điều kiện kết thúc */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <span>Hàng tháng · từ {shortDate(rule.startDate)}</span>
        <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium">
          {endLabel}
        </span>
      </div>

      {/* Dòng 3: trạng thái */}
      <p
        className={`mt-1.5 text-sm font-medium ${
          rule.nextDate !== null ? "text-primary" : "text-ink-muted"
        }`}
      >
        {rule.nextDate !== null
          ? `Kỳ tới: ${shortDate(rule.nextDate)}`
          : "Đã hoàn thành"}
      </p>
    </>
  );

  if (!isOwner) {
    // MEMBER: chỉ xem — card không chạm, không dẫn đến màn sửa
    return (
      <li>
        <Card>{inner}</Card>
      </li>
    );
  }

  return (
    <li>
      <Card>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Sửa giao dịch định kỳ ${rule.category.name}`}
          className="w-full text-left"
        >
          {inner}
        </button>
      </Card>
    </li>
  );
}
