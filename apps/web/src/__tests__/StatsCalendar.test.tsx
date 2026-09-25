import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatsCalendar } from "../features/stats/StatsCalendar";

/** byDay đủ 30 ngày tháng 9/2026, chỉ các ngày có key là có chi tiêu. */
function byDayFor(totals: Record<number, number>) {
  return Array.from({ length: 30 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    total: totals[i + 1] ?? 0,
  }));
}

/** Tháng 9/2026: 1/9 là thứ Ba → 1 ô lệch đầu (31/8) + 30 ngày + 4 ô lệch cuối (1–4/10) = 35 ô. */
function renderCalendar(totals: Record<number, number> = {}) {
  const onDayClick = vi.fn();
  const { container } = render(<StatsCalendar month="2026-09" byDay={byDayFor(totals)} onDayClick={onDayClick} />);
  const section = container.querySelector("section");
  return { onDayClick, cells: () => section!.querySelectorAll(".aspect-square") };
}

describe("StatsCalendar", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("vẽ đủ 35 ô cho tháng 9/2026 (bắt đầu thứ Hai) + header 7 thứ", () => {
    // Act
    const { cells } = renderCalendar();

    // Assert
    expect(cells().length).toBe(35);
    for (const header of ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
    // 31 chỉ thuộc tháng 8 (lệch đầu) — tháng 9 có 30 ngày
    expect(screen.getAllByText("31")).toHaveLength(1);
    // "1" và "4" xuất hiện 2 lần: trong tháng 9 + lệch cuối tháng 10
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getAllByText("4")).toHaveLength(2);
  });

  it("chỉ ngày CÓ chi tiêu là button; click truyền đúng date YYYY-MM-DD", () => {
    // Arrange
    const { onDayClick } = renderCalendar({ 9: 250_000 });

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Ngày 9, chi tiêu 250.000 ₫" }));

    // Assert
    expect(onDayClick).toHaveBeenCalledWith("2026-09-09");
    // Ngày không chi không phải button
    expect(screen.queryByRole("button", { name: /Ngày 15/ })).not.toBeInTheDocument();
  });

  it("hiển thị số tiền gọn không cắt: 250k, 1.2m", () => {
    // Arrange
    renderCalendar({ 9: 250_000, 20: 1_234_000 });

    // Assert
    expect(screen.getByText("250k")).toBeInTheDocument();
    expect(screen.getByText("1.2m")).toBeInTheDocument();
  });

  it("hôm nay được đánh dấu aria-current=date (ngày có chi)", () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 9)); // 9/9/2026
    renderCalendar({ 9: 250_000 });

    // Assert
    const todayBtn = screen.getByRole("button", { name: "Ngày 9, chi tiêu 250.000 ₫" });
    expect(todayBtn).toHaveAttribute("aria-current", "date");
  });

  it("hôm nay KHÔNG có chi vẫn tô highlight (ô số, không phải button)", () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 5)); // 5/9/2026
    renderCalendar();

    // Assert — "5" chỉ xuất hiện 1 lần (lệch cuối tháng 10 chỉ có 1–4)
    const todayCell = screen.getByText("5");
    expect(todayCell).toHaveAttribute("aria-current", "date");
    expect(todayCell).toHaveClass("bg-primary");
  });

  it.each([
    // [month, daysInMonth, tổng số ô] — phủ đủ shape: 28 ngày đầu tuần thứ CN,
    // 31 ngày đầu thứ CN (lưới đầy 42 ô), tháng 2 năm nhuận 29 ngày đầu thứ Ba
    ["2026-02", 28, 35],
    ["2026-03", 31, 42],
    ["2028-02", 29, 35],
  ])("tháng %s (%i ngày) → lưới đủ 7 cột, đúng %i ô", (month, daysInMonth, expectedCells) => {
    // Arrange + Act
    const byDay = Array.from({ length: daysInMonth }, (_, i) => ({
      date: `${month}-${String(i + 1).padStart(2, "0")}`,
      total: 0,
    }));
    const { container } = render(<StatsCalendar month={month} byDay={byDay} onDayClick={() => {}} />);

    // Assert
    const cells = container.querySelector("section")!.querySelectorAll(".aspect-square");
    expect(cells.length).toBe(expectedCells);
  });

  it("byDay thưa (thiếu ngày) coi như 0 — không crash", () => {
    // Arrange — chỉ 2 entry như payload test StatsPage
    render(
      <StatsCalendar
        month="2026-09"
        byDay={[
          { date: "2026-09-01", total: 0 },
          { date: "2026-09-10", total: 600_000 },
        ]}
        onDayClick={() => {}}
      />,
    );

    // Assert
    expect(screen.getByText("600k")).toBeInTheDocument();
  });
});
