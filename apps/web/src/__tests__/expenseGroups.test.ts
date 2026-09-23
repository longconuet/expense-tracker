import type { Expense } from "@expense-tracker/shared";
import { describe, expect, it } from "vitest";
import { today, yesterday } from "../core/dates";
import { dayLabel, groupByDay } from "../core/expenseGroups";

const CAT = { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 };

function expense(id: string, amount: number, date: string, createdByName = "An"): Expense {
  return {
    id,
    amount,
    date,
    note: null,
    category: CAT,
    createdByName,
    createdAt: `${date}T06:00:00.000Z`,
  };
}

/** "YYYY-MM-DD" của N ngày trước hôm nay. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

describe("core/expenseGroups", () => {
  it("nhóm theo ngày, giữ ngày mới trước, tiểu kết tổng ngày đúng", () => {
    // Arrange
    const input = [
      expense("e1", 50_000, today()),
      expense("e2", 30_000, today()),
      expense("e3", 100_000, yesterday()),
    ];

    // Act
    const groups = groupByDay(input);

    // Assert
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe(today());
    expect(groups[0].total).toBe(80_000);
    expect(groups[0].expenses.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(groups[1].date).toBe(yesterday());
    expect(groups[1].total).toBe(100_000);
    expect(groups[1].expenses).toHaveLength(1);
  });

  it("label: Hôm nay / Hôm qua / dd-mm", () => {
    expect(dayLabel(today())).toBe("Hôm nay");
    expect(dayLabel(yesterday())).toBe("Hôm qua");

    const d = new Date();
    d.setDate(d.getDate() - 2);
    const expected = `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1,
    ).padStart(2, "0")}`;
    expect(dayLabel(daysAgo(2))).toBe(expected);
  });

  it("label khác năm hiện tại → dd-mm-yyyy", () => {
    const year = new Date().getFullYear() - 2;
    expect(dayLabel(`${year}-06-15`)).toBe(`15/06/${year}`);
  });

  it("list rỗng → mảng rỗng", () => {
    expect(groupByDay([])).toEqual([]);
  });
});
