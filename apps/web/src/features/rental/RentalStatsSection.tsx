import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { formatMeter, formatVnd, type RentalMonth } from "@expense-tracker/shared";
import { monthLabel } from "../../core/dates";
import { Card } from "../../shared/ui/Card";
import {
  buildTrendData,
  selectStatsMonths,
  statsYears,
  summarizeTrend,
  type StatsRange,
} from "./rentalStats";
import { MeterTrendPanel } from "./MeterTrendPanel";

/**
 * Palette chart panel Nước — hex cố định (precedent: PIE_COLORS ở StatsPage;
 * blue = nước, đọc được cả 2 theme). Panel Điện dùng token --color-primary.
 */
const WATER_BAR_COLOR = "#3b82f6";
const WATER_LINE_COLOR = "#2563eb";

/**
 * Section "📊 Sử dụng điện & nước" — so sánh lượng + tiền điện/nước theo tháng
 * (spec `docs/spec-rental-stats.md`). Chỉ tháng CONFIRMED; dữ liệu đọc từ
 * payload GET /rental do parent (`RentalPage`) truyền xuống — không tự fetch.
 *
 * Selector chip: "12 tháng gần" (default = 12 tháng đã chốt gần nhất) ·
 * "Tất cả" · năm (chỉ năm có ≥ 1 tháng đã chốt).
 */
export function RentalStatsSection({ months }: { months: RentalMonth[] }) {
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

  return (
    <Card className="mt-4">
      <h2 className="font-semibold text-ink">📊 Sử dụng điện &amp; nước</h2>
      <p className="mt-0.5 text-xs text-ink-muted">Chỉ tính các tháng đã chốt.</p>

      {confirmedCount === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">
          Chưa có dữ liệu — thống kê hiện sau khi bạn chốt tháng đầu tiên.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
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
              unit="m³"
              data={waterData}
              summary={waterSummary}
              barColor={WATER_BAR_COLOR}
              lineColor={WATER_LINE_COLOR}
            />
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-xs">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th scope="col" className="pb-2 font-medium">
                    Tháng
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Điện (kWh)
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Tiền điện
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Nước (m³)
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Tiền nước
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...selected]
                  .sort((a, b) => b.month.localeCompare(a.month))
                  .map((m) => (
                    <tr key={m.month} className="border-t border-border">
                      <td className="py-1.5 text-ink">{monthLabel(m.month)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMeter(m.elecConsumption)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatVnd(m.electricityCost)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMeter(m.waterConsumption)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatVnd(m.waterCost)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
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
