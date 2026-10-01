import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatMeter, formatVnd, type RentalListResponse } from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { fetchRental } from "../../core/dataApi";
import { monthLabel } from "../../core/dates";
import { Card } from "../../shared/ui/Card";
import { Spinner } from "../../shared/ui/Spinner";
import { BoltIcon, DropletIcon } from "../../shared/ui/icons";
import {
  buildTrendData,
  selectStatsMonths,
  statsYears,
  summarizeTrend,
  type StatsRange,
} from "./rentalStats";
import { MeterTrendPanel } from "./MeterTrendPanel";

/**
 * Palette chart panel Nước — bar hex cố định (precedent: PIE_COLORS ở
 * StatsPage; blue = nước, đọc được cả 2 theme). Line tiền nước dùng token
 * --color-water (khớp icon/badge, tương phản tốt hơn ở dark). Panel Điện
 * dùng token --color-primary / --color-primary-text.
 */
const WATER_BAR_COLOR = "#3b82f6";

/**
 * Màn thống kê "Sử dụng điện & nước" — route /rental/stats
 * (spec `docs/spec-rental-stats.md`). Vào từ nút trên list màn /rental;
 * back về danh sách tháng. So sánh lượng + tiền điện/nước theo tháng —
 * chỉ tháng CONFIRMED (DRAFT chưa đọc số công tơ sẽ méo chart).
 *
 * Selector chip: "12 tháng gần" (default = 12 tháng đã chốt gần nhất) ·
 * "Tất cả" · năm (chỉ năm có ≥ 1 tháng đã chốt).
 *
 * Bảng chi tiết trên CARD RIÊNG (heading "Chi tiết theo tháng"), 3 cột
 * (mobile không scroll ngang): tháng | ⚡ Điện | 💧 Nước — mỗi cột 1 DÒNG:
 * badge số lượng (điện primary-soft, nước water-soft) + số tiền ngang hàng.
 */
export default function RentalStatsPage() {
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);

  const [data, setData] = useState<RentalListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!activeFamilyId) return;
    let cancelled = false;
    fetchRental(activeFamilyId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Không tải được dữ liệu.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFamilyId]);

  useEffect(() => {
    setLoading(true);
    return reload();
  }, [reload]);

  const months = useMemo(() => data?.months ?? [], [data]);
  const confirmedCount = useMemo(
    () => months.filter((m) => m.status === "CONFIRMED").length,
    [months],
  );
  const years = useMemo(() => statsYears(months), [months]);
  const [range, setRange] = useState<StatsRange>("12m");

  // Năm đang chọn có thể biến mất (tháng của năm bị xoá hết) → fallback "12m"
  const effectiveRange: StatsRange =
    range === "12m" || range === "all" || years.includes(range) ? range : "12m";

  const selected = useMemo(() => selectStatsMonths(months, effectiveRange), [months, effectiveRange]);
  const elecData = useMemo(() => buildTrendData(selected, "elec"), [selected]);
  const waterData = useMemo(() => buildTrendData(selected, "water"), [selected]);
  const elecSummary = useMemo(() => summarizeTrend(selected, "elec"), [selected]);
  const waterSummary = useMemo(() => summarizeTrend(selected, "water"), [selected]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="py-16 text-center">
        <p role="alert" className="font-medium text-danger">
          {error}
        </p>
        <Link to="/rental" className="mt-3 inline-block text-sm text-primary-text underline">
          ← Về danh sách tháng
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/rental" className="text-sm text-primary-text underline">
        ← Về danh sách tháng
      </Link>
      <h1 className="mt-2 text-xl font-bold text-ink">Sử dụng điện &amp; nước</h1>
      <p className="mt-0.5 text-xs text-ink-muted">Chỉ tính các tháng đã chốt.</p>

      {confirmedCount === 0 ? (
        <Card className="mt-4">
          <p className="text-sm text-ink-muted">
            {data?.config
              ? "Chưa có dữ liệu — thống kê hiện sau khi bạn chốt tháng đầu tiên."
              : "Chưa có thông tin phòng trọ — thống kê hiện sau khi chốt tháng đầu tiên."}
          </p>
        </Card>
      ) : (
        <>
          <Card className="mt-4">
            <div className="flex flex-wrap gap-2">
              <RangeChip pressed={effectiveRange === "12m"} onClick={() => setRange("12m")}>
                12 tháng gần
              </RangeChip>
              <RangeChip pressed={effectiveRange === "all"} onClick={() => setRange("all")}>
                Tất cả
              </RangeChip>
              {years.map((y) => (
                <RangeChip key={y} pressed={effectiveRange === y} onClick={() => setRange(y)}>
                  {y}
                </RangeChip>
              ))}
            </div>

            {elecSummary && (
              <MeterTrendPanel
                title="Điện"
                titleIcon={<BoltIcon className="h-4 w-4 text-primary" />}
                unit="kWh"
                data={elecData}
                summary={elecSummary}
                barColor="var(--color-primary)"
                lineColor="var(--color-primary-text)"
              />
            )}
            {waterSummary && (
              <MeterTrendPanel
                title="Nước"
                titleIcon={<DropletIcon className="h-4 w-4 text-water" />}
                unit="m³"
                data={waterData}
                summary={waterSummary}
                barColor={WATER_BAR_COLOR}
                lineColor="var(--color-water)"
              />
            )}
          </Card>

          {/* Bảng chi tiết — card RIÊNG (tách khỏi card biểu đồ), 1 tháng =
              1 dòng (badge + tiền ngang hàng, nowrap). overflow-x-auto chỉ là
              safety net: với dữ liệu thực tế (kWh ≤ 3 chữ số, tiền ≤ 7 chữ số)
              bảng vừa trong card ở 360px — có E2E assert không overflow. */}
          <Card className="mt-4">
            <h2 className="font-semibold text-ink">Chi tiết theo tháng</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th scope="col" className="pb-2 pr-2" aria-label="Tháng"></th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      <span className="inline-flex items-center gap-1">
                        <BoltIcon className="h-3.5 w-3.5 text-primary" />
                        Điện
                      </span>
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      <span className="inline-flex items-center gap-1 text-water">
                        <DropletIcon className="h-3.5 w-3.5" />
                        Nước
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...selected]
                    .sort((a, b) => b.month.localeCompare(a.month))
                    .map((m) => (
                      <tr key={m.month} className="border-t border-border">
                        <td className="whitespace-nowrap py-2 pr-1.5 text-ink">
                          {monthLabel(m.month)}
                        </td>
                        <td className="whitespace-nowrap py-2">
                          <div className="flex items-center justify-end gap-0.5">
                            <span className="inline-flex items-center rounded-full bg-primary-soft px-1 py-0.5 text-[11px] font-medium tabular-nums text-primary-text">
                              {formatMeter(m.elecConsumption)} kWh
                            </span>
                            <span className="font-medium tabular-nums text-ink">
                              {formatVnd(m.electricityCost)}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap py-2">
                          <div className="flex items-center justify-end gap-0.5">
                            <span className="inline-flex items-center rounded-full bg-water-soft px-1 py-0.5 text-[11px] font-medium tabular-nums text-water-text">
                              {formatMeter(m.waterConsumption)} m³
                            </span>
                            <span className="font-medium tabular-nums text-ink">
                              {formatVnd(m.waterCost)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/** Chip lọc phạm vi — pattern như FilterChip (màn Lịch sử). */
function RangeChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        pressed ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-ink-muted"
      }`}
    >
      {children}
    </button>
  );
}
