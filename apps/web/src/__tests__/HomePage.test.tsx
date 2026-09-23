import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/dataApi", () => ({
  fetchStats: vi.fn(),
  fetchExpenses: vi.fn(),
}));

import { fetchExpenses, fetchStats } from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import { ApiError } from "../core/api";
import HomePage from "../features/home/HomePage";

const fetchStatsMock = vi.mocked(fetchStats);
const fetchExpensesMock = vi.mocked(fetchExpenses);

const CAT = { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 };
const EXPENSE = {
  id: "e1",
  amount: 50000,
  date: "2026-09-22",
  note: "cơm trưa",
  category: CAT,
  createdByName: "An",
  createdAt: "2026-09-22T06:00:00.000Z",
};

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <HomePage />
    </MemoryRouter>,
  );
}

describe("Trang chủ", () => {
  beforeEach(() => {
    useAuthStore.setState({ activeFamilyId: "f1" });
    fetchStatsMock.mockReset();
    fetchExpensesMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("hiện tổng tháng + so sánh tháng trước + phân rã danh mục + khoản gần đây", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue({
      month: "2026-09",
      total: 1_000_000,
      previousMonthTotal: 500_000,
      byCategory: [{ category: CAT, total: 600_000, percent: 60 }],
      byDay: [],
    });
    fetchExpensesMock.mockResolvedValue({ expenses: [EXPENSE], meta: { page: 1, pageSize: 5, total: 1 } });
    renderHome();

    // Assert
    expect(await screen.findByRole("heading", { name: "Trang chủ" })).toBeInTheDocument();
    expect(screen.getByText("1.000.000 ₫")).toBeInTheDocument();
    expect(screen.getByText(/Tăng 100% so với tháng trước/)).toBeInTheDocument();
    expect(screen.getByText("600.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("cơm trưa")).toBeInTheDocument();
    expect(screen.getByText(/22\/09 · An/)).toBeInTheDocument();
    expect(fetchStatsMock).toHaveBeenCalledWith("f1", expect.any(String));
    expect(fetchExpensesMock).toHaveBeenCalledWith("f1", expect.objectContaining({ pageSize: 5 }));
  });

  it("tháng chưa có chi tiêu → hiện empty state + nút gọi thêm khoản", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue({
      month: "2026-09",
      total: 0,
      previousMonthTotal: 0,
      byCategory: [],
      byDay: [],
    });
    fetchExpensesMock.mockResolvedValue({ expenses: [], meta: { page: 1, pageSize: 5, total: 0 } });
    renderHome();

    // Assert
    expect(
      await screen.findByText("Chưa có khoản chi nào tháng này"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thêm khoản chi đầu tiên" })).toHaveAttribute(
      "href",
      "/add",
    );
  });

  it("API lỗi → hiển thị thông báo lỗi", async () => {
    // Arrange
    fetchStatsMock.mockRejectedValue(new ApiError("NETWORK_ERROR", "Không kết nối được máy chủ.", 0));
    fetchExpensesMock.mockResolvedValue({ expenses: [], meta: { page: 1, pageSize: 5, total: 0 } });
    renderHome();

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Không kết nối được máy chủ.");
  });
});
