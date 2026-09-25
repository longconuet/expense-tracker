import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../core/api";
import { fetchExpenses, type ExpenseListResult } from "../core/dataApi";
import { DayDetailModal } from "../features/stats/DayDetailModal";

vi.mock("../core/dataApi", () => ({
  fetchExpenses: vi.fn(),
}));

const fetchExpensesMock = vi.mocked(fetchExpenses);

const CAT_EAT = { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 };
const CAT_FUEL = { id: "c2", name: "Đi lại", icon: "🚗", isPreset: true, order: 1 };

function expensesFixture() {
  return {
    expenses: [
      {
        id: "e1",
        amount: 250_000,
        date: "2026-09-09",
        note: "Tiệc liên hoan",
        category: CAT_EAT,
        createdByName: "An",
        createdAt: "2026-09-09T04:00:00.000Z",
      },
      {
        id: "e2",
        amount: 200_000,
        date: "2026-09-09",
        note: null,
        category: CAT_FUEL,
        createdByName: "Bình",
        createdAt: "2026-09-09T05:00:00.000Z",
      },
    ],
    meta: { page: 1, pageSize: 100, total: 2 },
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof DayDetailModal>> = {}) {
  return render(
    <DayDetailModal open date="2026-09-09" familyId="f1" onClose={() => {}} {...props} />,
  );
}

describe("DayDetailModal", () => {
  beforeEach(() => {
    fetchExpensesMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("khi mở fetch đúng ngày (pageSize 100), hiển thị tổng + từng khoản chi tiết", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue(expensesFixture());
    renderModal();

    // Assert
    expect(fetchExpensesMock).toHaveBeenCalledWith("f1", { date: "2026-09-09", page: 1, pageSize: 100 });
    expect(screen.getByRole("dialog")).toHaveTextContent(/Chi tiêu ngày 09\/09/);
    expect(await screen.findByText("450.000 ₫")).toBeInTheDocument(); // tổng 2 khoản
    expect(screen.getByText("Tiệc liên hoan")).toBeInTheDocument();
    expect(screen.getByText("Ăn uống · An")).toBeInTheDocument();
    expect(screen.getByText("250.000 ₫")).toBeInTheDocument();
    // Khoản không có note → hiện tên danh mục
    expect(screen.getByText("Đi lại · Bình")).toBeInTheDocument();
    expect(screen.getByText("200.000 ₫")).toBeInTheDocument();
  });

  it("đang fetch → spinner, xong mới hiện list", async () => {
    // Arrange — resolve sau khi đã render lần đầu
    let resolveFetch: (value: ExpenseListResult) => void = () => {};
    fetchExpensesMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    renderModal();

    // Assert — đang tải
    expect(screen.getByRole("status", { name: "Đang tải" })).toBeInTheDocument();
    expect(screen.queryByText("Tiệc liên hoan")).not.toBeInTheDocument();

    // Act
    resolveFetch(expensesFixture());
    await screen.findByText("Tiệc liên hoan");

    // Assert
    expect(screen.queryByRole("status", { name: "Đang tải" })).not.toBeInTheDocument();
  });

  it("ngày không có khoản chi → hiện thông báo rỗng (không lỗi)", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: [],
      meta: { page: 1, pageSize: 100, total: 0 },
    });
    renderModal();

    // Assert
    expect(await screen.findByText("Ngày này chưa có khoản chi.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ngày có > 100 khoản (bị cap) → hiện dòng báo list bị cắt", async () => {
    // Arrange — 100 khoản trả về nhưng tổng 150
    const many = Array.from({ length: 100 }, (_, i) => ({
      id: `e${i}`,
      amount: 1000,
      date: "2026-09-09",
      note: null,
      category: CAT_EAT,
      createdByName: "An",
      createdAt: "2026-09-09T04:00:00.000Z",
    }));
    fetchExpensesMock.mockResolvedValue({
      expenses: many,
      meta: { page: 1, pageSize: 100, total: 150 },
    });
    renderModal();

    // Assert
    expect(
      await screen.findByText("Đang hiển thị 100/150 khoản của ngày."),
    ).toBeInTheDocument();
  });

  it("fetch lỗi → thông báo lỗi + nút Thử lại; bấm thử lại fetch lại và hiện data", async () => {
    // Arrange
    fetchExpensesMock
      .mockRejectedValueOnce(new ApiError("NETWORK_ERROR", "Mất kết nối.", 0))
      .mockResolvedValueOnce(expensesFixture());
    renderModal();

    // Assert — lỗi
    expect(await screen.findByRole("alert")).toHaveTextContent("Mất kết nối.");
    expect(fetchExpensesMock).toHaveBeenCalledTimes(1);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    // Assert — fetch lại thành công
    expect(fetchExpensesMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Tiệc liên hoan")).toBeInTheDocument();
  });

  it("bấm nút X → gọi onClose", () => {
    // Arrange
    const onClose = vi.fn();
    fetchExpensesMock.mockResolvedValue(expensesFixture());
    renderModal({ onClose });

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));

    // Assert
    expect(onClose).toHaveBeenCalled();
  });

  it("open=false → không render dialog, không fetch", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue(expensesFixture());
    renderModal({ open: false });

    // Assert
    await waitFor(() => expect(fetchExpensesMock).not.toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
