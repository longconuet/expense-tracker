import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Expense, MonthlyStats } from "@expense-tracker/shared";
import { formatVnd } from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { fetchExpenses, fetchStats } from "../../core/dataApi";
import { currentMonth, monthLabel, shortDate } from "../../core/dates";
import { useRefetchOnSync } from "../../core/useRefetchOnSync";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { Spinner } from "../../shared/ui/Spinner";

/**
 * Trang chủ: tổng quan chi tiêu tháng hiện tại (tổng + theo danh mục)
 * + 5 khoản chi gần nhất.
 */
export default function HomePage() {
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);
  const month = currentMonth();

  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [recent, setRecent] = useState<Expense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Khoản offline vừa sync về server → refetch
  useRefetchOnSync(() => setReloadKey((k) => k + 1));

  useEffect(() => {
    if (!activeFamilyId) return;
    let cancelled = false;
    setStats(null);
    setRecent(null);
    setError(null);

    Promise.all([
      fetchStats(activeFamilyId, month),
      fetchExpenses(activeFamilyId, { month, pageSize: 5 }),
    ])
      .then(([statsData, page]) => {
        if (!cancelled) {
          setStats(statsData);
          setRecent(page.expenses);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không tải được dữ liệu.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeFamilyId, month, reloadKey]);

  if (error) {
    return <p role="alert" className="text-sm font-medium text-danger">{error}</p>;
  }

  if (!stats || !recent) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // Thay đổi so với tháng trước (chỉ có nghĩa khi tháng trước > 0)
  const deltaPercent =
    stats.previousMonthTotal > 0
      ? Math.round(((stats.total - stats.previousMonthTotal) / stats.previousMonthTotal) * 100)
      : null;

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Trang chủ</h1>
      <p className="mt-0.5 text-sm text-ink-muted">{monthLabel(month)}</p>

      {/* Tổng tháng này */}
      <Card className="mt-4">
        <p className="text-sm text-ink-muted">Tổng chi tiêu</p>
        <p className="mt-1 text-3xl font-bold text-ink">{formatVnd(stats.total)}</p>
        {deltaPercent !== null && (
          <p
            className={`mt-1 text-sm font-medium ${
              deltaPercent > 0 ? "text-danger" : "text-primary"
            }`}
          >
            {deltaPercent > 0 ? "Tăng" : "Giảm"} {Math.abs(deltaPercent)}% so với tháng trước
          </p>
        )}
      </Card>

      {stats.total === 0 ? (
        <Card className="mt-4 text-center">
          <p className="text-4xl" aria-hidden>
            🎉
          </p>
          <p className="mt-2 font-medium text-ink">Chưa có khoản chi nào tháng này</p>
          <p className="mt-1 text-sm text-ink-muted">Bắt đầu ghi chép chi tiêu của cả nhà nhé!</p>
          <div className="mt-4">
            <Link to="/add">
              <Button>Thêm khoản chi đầu tiên</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {/* Theo danh mục */}
          <Card className="mt-4">
            <h2 className="font-semibold text-ink">Theo danh mục</h2>
            <ul className="mt-3 space-y-3">
              {stats.byCategory.map(({ category, total, percent }) => (
                <li key={category.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-ink">
                      <span aria-hidden>{category.icon}</span>
                      {category.name}
                    </span>
                    <span className="text-ink-muted">{formatVnd(total)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(percent, 2)}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs text-ink-muted">
                      {percent}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* Gần đây */}
          <Card className="mt-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Gần đây</h2>
              <Link to="/history" className="text-sm font-medium text-primary hover:underline">
                Xem tất cả
              </Link>
            </div>
            <ul className="mt-3 space-y-2.5">
              {recent.map((expense) => (
                <li key={expense.id} className="flex items-center gap-3">
                  <span className="text-xl" aria-hidden>
                    {expense.category.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {expense.note || expense.category.name}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {shortDate(expense.date)} · {expense.createdByName}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-ink">
                    {formatVnd(expense.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
