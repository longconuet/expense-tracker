import { useEffect, useState } from "react";
import type { Expense } from "@expense-tracker/shared";
import { formatVnd } from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { fetchExpenses } from "../../core/dataApi";
import { shortDate } from "../../core/dates";
import { Button } from "../../shared/ui/Button";
import { Modal } from "../../shared/ui/Modal";
import { Spinner } from "../../shared/ui/Spinner";

interface DayDetailModalProps {
  open: boolean;
  /** "YYYY-MM-DD" — ngày được chọn từ lịch (null = chưa chọn). */
  date: string | null;
  familyId: string;
  onClose: () => void;
}

/**
 * Popup danh sách chi tiết khoản chi của 1 ngày (mở từ card Lịch chi tiêu).
 * Fetch theo `date` khi mở — đi qua read cache nên offline vẫn xem được.
 */
export function DayDetailModal({ open, date, familyId, onClose }: DayDetailModalProps) {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  /** Tổng số khoản trong ngày (meta.total) — để báo khi list bị cắt ở cap 100. */
  const [totalItems, setTotalItems] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open || !date) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpenses(null);
    setTotalItems(null);

    fetchExpenses(familyId, { date, page: 1, pageSize: 100 })
      .then((result) => {
        if (!cancelled) {
          setExpenses(result.expenses);
          setTotalItems(result.meta.total);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Không tải được chi tiết ngày này.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, date, familyId, reloadKey]);

  const total = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);

  return (
    <Modal
      open={open && date !== null}
      onClose={onClose}
      title={date ? `Chi tiêu ngày ${shortDate(date)}` : undefined}
      showClose
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : error ? (
        <div className="py-4 text-center">
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>
            Thử lại
          </Button>
        </div>
      ) : expenses && expenses.length > 0 ? (
        <>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-ink-muted">Tổng</span>
            <span className="font-semibold text-ink">{formatVnd(total)}</span>
          </div>
          <ul className="mt-3 space-y-2.5">
            {expenses.map((expense) => (
              <li key={expense.id} className="flex items-center gap-3">
                <span className="text-xl" aria-hidden>
                  {expense.category.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {expense.note || expense.category.name}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {expense.category.name} · {expense.createdByName}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-ink">{formatVnd(expense.amount)}</span>
              </li>
            ))}
          </ul>
          {/* Cap pageSize = 100: ngày có > 100 khoản thì "Tổng" chỉ tính phần hiển thị */}
          {totalItems !== null && expenses.length < totalItems && (
            <p className="mt-2 text-xs text-ink-muted">
              Đang hiển thị {expenses.length}/{totalItems} khoản của ngày.
            </p>
          )}
        </>
      ) : (
        <p className="py-4 text-center text-sm text-ink-muted">Ngày này chưa có khoản chi.</p>
      )}
    </Modal>
  );
}
