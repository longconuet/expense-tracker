import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExpenseRow, type ExpenseRowProps } from "../shared/ui/ExpenseRow";

const CAT = { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 };

function expense(note: string | null, recurringRuleId: string | null = null) {
  return {
    id: "e1",
    amount: 50_000,
    date: "2026-09-30",
    note,
    category: CAT,
    createdByName: "An",
    createdAt: "2026-09-30T06:00:00.000Z",
    recurringRuleId,
  };
}

function renderRow(
  size?: ExpenseRowProps["size"],
  note: string | null = "cơm trưa",
  recurringRuleId: string | null = null,
) {
  // Container flex như trên 2 màn thật — giữ điều kiện truncate/width tương đương
  return render(
    <div className="flex items-center gap-3">
      <ExpenseRow expense={expense(note, recurringRuleId)} size={size} />
    </div>,
  );
}

describe("ExpenseRow (hàng khoản chi dùng chung)", () => {
  afterEach(() => {
    cleanup();
  });

  it("tiêu đề = tên danh mục (KHÔNG phải note), số tiền + note vẫn hiện", () => {
    renderRow();
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
    expect(screen.getByText("50.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("cơm trưa")).toBeInTheDocument();
  });

  it("có note → cùng hàng người tạo, note nằm SAU người tạo", () => {
    renderRow();
    expect(screen.getByText("cơm trưa").parentElement).toHaveTextContent("An · cơm trưa");
  });

  it("note = null → dòng 2 chỉ tên người tạo (exact match, không sót '·' hay note)", () => {
    renderRow("md", null);
    expect(screen.getByText("An")).toBeInTheDocument();
  });

  it("size md (mặc định): icon text-2xl, không text-sm; size sm: icon text-xl + title/amount text-sm", () => {
    renderRow("sm");
    expect(screen.getByText("🍜")).toHaveClass("text-xl");
    expect(screen.getByText("Ăn uống")).toHaveClass("text-sm");
    expect(screen.getByText("50.000 ₫")).toHaveClass("text-sm");
    cleanup();
    renderRow("md");
    expect(screen.getByText("🍜")).toHaveClass("text-2xl");
    expect(screen.getByText("Ăn uống")).not.toHaveClass("text-sm");
    expect(screen.getByText("50.000 ₫")).not.toHaveClass("text-sm");
  });

  // case 60 (spec-recurring §5.3): icon định kỳ cho khoản sinh từ rule
  it("khoản sinh từ rule (recurringRuleId) → icon định kỳ + sr-only 'định kỳ'; khoản thường → không", () => {
    // Khoản thường — không có icon
    renderRow();
    expect(screen.queryByText("định kỳ")).not.toBeInTheDocument();
    cleanup();

    // Khoản sinh từ rule — icon cạnh tên danh mục (sr-only cho screen reader)
    renderRow("md", "cơm trưa", "r1");
    const sr = screen.getByText("định kỳ");
    expect(sr).toHaveClass("sr-only");
    expect(sr.parentElement).toHaveTextContent("Ăn uống");
  });
});
