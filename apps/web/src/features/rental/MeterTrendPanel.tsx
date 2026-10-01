import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { formatMeter, formatVnd } from "@expense-tracker/shared";
import { monthLabel } from "../../core/dates";
import {
  formatTrieu,
  formatTooltipValue,
  monthShortLabel,
  type TrendPoint,
  type TrendSummary,
} from "./rentalStats";

/** Style tooltip — khớp TOOLTIP_STYLE của màn Thống kê (StatsPage). */
const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  color: "var(--color-ink)",
  fontSize: 13,
} as const;

interface MeterTrendPanelProps {
  title: string; // "Điện" | "Nước"
  /** Icon trước tiêu đề (BoltIcon / DropletIcon) — giúp phân biệt 2 panel. */
  titleIcon?: ReactNode;
  unit: string; // "kWh" | "m³"
  data: TrendPoint[]; // asc (caller đã chọn theo range)
  summary: TrendSummary; // caller đã guard tập không rỗng
  barColor: string;
  lineColor: string;
}

/**
 * 1 panel thống kê: tiêu đề + dòng summary (TB/cao nhất/thấp nhất) +
 * ComposedChart: CỘT = lượng tiêu thụ (trục trái) + ĐƯỜNG = tiền (trục phải,
 * compact "triệu đ"). Pattern recharts + token màu theo StatsPage hiện có.
 */
export function MeterTrendPanel({
  title,
  titleIcon,
  unit,
  data,
  summary,
  barColor,
  lineColor,
}: MeterTrendPanelProps) {
  return (
    <section aria-label={title} className="mt-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        {titleIcon}
        {title}
      </h3>
      <p className="mt-0.5 text-xs text-ink-muted">
        TB {formatMeter(summary.avgQty)} {unit} · {formatVnd(summary.avgCost)}/tháng
        {data.length > 1 &&
          ` · Cao nhất ${monthShortLabel(summary.peakMonth)} (${formatMeter(summary.peakQty)} ${unit}) · Thấp nhất ${monthShortLabel(summary.lowMonth)}`}
      </p>
      <div className="mt-2 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <XAxis
              dataKey="label"
              minTickGap={12}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 10 }}
            />
            <YAxis
              yAxisId="qty"
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={30}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 10 }}
            />
            <YAxis
              yAxisId="cost"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 10 }}
              tickFormatter={(v: number) => `${formatTrieu(v)} tr`}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: "var(--color-ink-muted)", opacity: 0.1 }}
              labelFormatter={(_label, payload) => {
                const month = (payload?.[0] as { payload?: { month?: string } } | undefined)?.payload
                  ?.month;
                return month ? monthLabel(month) : String(_label);
              }}
              formatter={(value, _name, item) =>
                formatTooltipValue(String((item as { dataKey?: string | number } | undefined)?.dataKey ?? ""), Number(value), unit)
              }
            />
            <Bar
              yAxisId="qty"
              dataKey="qty"
              fill={barColor}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
            <Line yAxisId="cost" dataKey="cost" stroke={lineColor} strokeWidth={2} dot={{ r: 2.5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
