import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyStats } from "@expense-tracker/shared";
import { formatVnd } from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { fetchStats } from "../../core/dataApi";
import { addMonths, currentMonth, monthLabel } from "../../core/dates";
import { useRefetchOnSync } from "../../core/useRefetchOnSync";
import { Card } from "../../shared/ui/Card";
import { ChevronLeftIcon, ChevronRightIcon } from "../../shared/ui/icons";
import { StatsSkeleton } from "./StatsSkeleton";

/** Palette cố định cho các lát donut — độ sáng vừa phải, đọc được cả 2 theme. */
const PIE_COLORS = [
  "#0d9488",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#3b82f6",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  color: "var(--color-ink)",
  fontSize: 13,
};

/**
 * Màn thống kê: tổng theo tháng + donut theo danh mục + bar theo ngày.
 * Điều hướng tháng tiến/lùi (không qua tháng hiện tại).
 */
export default function StatsPage() {
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);
  const [month, setMonth] = useState(currentMonth());
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const lastQuery = useRef("");
  const lastOk = useRef(false);

  // Khoản offline vừa sync về server → refetch
  useRefetchOnSync(() => setReloadKey((k) => k + 1));

  const atCurrentMonth = month === currentMonth();

  useEffect(() => {
    if (!activeFamilyId) return;
    let cancelled = false;
    // Refetch lặng lẽ (tháng không đổi + lần fetch trước OK) → GIỮ data cũ.
    // Đổi tháng = query mới → reset → hiện skeleton.
    const query = `${activeFamilyId}|${month}`;
    const isSilent = lastQuery.current === query && lastOk.current;
    lastQuery.current = query;
    if (!isSilent) {
      lastOk.current = false;
      setStats(null);
    }
    setError(null);

    fetchStats(activeFamilyId, month)
      .then((data) => {
        if (!cancelled) {
          lastOk.current = true;
          setStats(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không tải được thống kê.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeFamilyId, month, reloadKey]);

  function changeMonth(delta: number) {
    const next = addMonths(month, delta);
    if (next <= currentMonth()) {
      setMonth(next);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Thống kê</h1>

      {/* Chọn tháng */}
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Tháng trước"
          className="rounded-lg p-2 text-ink-muted transition hover:bg-ink/5"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <span className="font-semibold text-ink">{monthLabel(month)}</span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          disabled={atCurrentMonth}
          aria-label="Tháng sau"
          className="rounded-lg p-2 text-ink-muted transition hover:bg-ink/5 disabled:opacity-30"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {!stats && !error ? (
        <StatsSkeleton />
      ) : stats && stats.total === 0 ? (
        <Card className="mt-4 text-center">
          <p className="text-4xl" aria-hidden>
            📊
          </p>
          <p className="mt-2 font-medium text-ink">Chưa có dữ liệu tháng này</p>
          <p className="mt-1 text-sm text-ink-muted">Ghi khoản chi đầu tiên để xem biểu đồ.</p>
        </Card>
      ) : stats ? (
        <>
          {/* Tổng tháng */}
          <Card className="mt-4">
            <p className="text-sm text-ink-muted">Tổng chi tiêu</p>
            <p className="mt-1 text-3xl font-bold text-ink">{formatVnd(stats.total)}</p>
            {stats.previousMonthTotal > 0 && (
              <p
                className={`mt-1 text-sm font-medium ${
                  stats.total > stats.previousMonthTotal ? "text-danger" : "text-primary"
                }`}
              >
                {stats.total > stats.previousMonthTotal ? "Tăng" : "Giảm"}{" "}
                {Math.abs(
                  Math.round(
                    ((stats.total - stats.previousMonthTotal) / stats.previousMonthTotal) * 100,
                  ),
                )}
                % so với tháng trước
              </p>
            )}
          </Card>

          {/* Theo danh mục — donut + chú thích */}
          <Card className="mt-4">
            <h2 className="font-semibold text-ink">Theo danh mục</h2>
            <div className="mt-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.byCategory}
                    dataKey="total"
                    nameKey="category.name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    stroke="var(--color-card)"
                  >
                    {stats.byCategory.map((entry, index) => (
                      <Cell key={entry.category.id} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatVnd(Number(value))}
                    contentStyle={TOOLTIP_STYLE}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 space-y-2">
              {stats.byCategory.map((entry, index) => (
                <li key={entry.category.id} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                  />
                  <span className="font-medium text-ink">{entry.category.name}</span>
                  <span className="ml-auto text-ink-muted">
                    {formatVnd(entry.total)} · {entry.percent}%
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Theo ngày — bar */}
          <Card className="mt-4">
            <h2 className="font-semibold text-ink">Theo ngày</h2>
            <div className="mt-2 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.byDay.map((d) => ({ day: Number(d.date.slice(8)), total: d.total }))}
                >
                  <XAxis
                    dataKey="day"
                    interval={4}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--color-ink-muted)", fontSize: 10 }}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value) => formatVnd(Number(value))}
                    labelFormatter={(day) => `Ngày ${day}`}
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: "var(--color-ink-muted)", opacity: 0.1 }}
                  />
                  <Bar dataKey="total" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
