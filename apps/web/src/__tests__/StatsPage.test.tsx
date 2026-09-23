import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStats } from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import { ApiError } from "../core/api";
import { addMonths, currentMonth } from "../core/dates";
import StatsPage from "../features/stats/StatsPage";

vi.mock("../core/dataApi", () => ({
  fetchStats: vi.fn(),
}));

const fetchStatsMock = vi.mocked(fetchStats);

const CAT_A = { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 };
const CAT_B = { id: "c2", name: "Đi lại", icon: "🚗", isPreset: true, order: 1 };

function stats(total: number, previousMonthTotal: number) {
  return {
    month: currentMonth(),
    total,
    previousMonthTotal,
    byCategory:
      total > 0
        ? [
            { category: CAT_A, total: 600_000, percent: 60 },
            { category: CAT_B, total: 400_000, percent: 40 },
          ]
        : [],
    byDay:
      total > 0
        ? [
            { date: `${currentMonth()}-01`, total: 0 },
            { date: `${currentMonth()}-10`, total: 600_000 },
          ]
        : [],
  };
}

function renderStats() {
  return render(
    <MemoryRouter initialEntries={["/stats"]}>
      <StatsPage />
    </MemoryRouter>,
  );
}

describe("Thống kê", () => {
  beforeEach(() => {
    useAuthStore.setState({ activeFamilyId: "f1" });
    fetchStatsMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("hiện tổng tháng + so sánh + chú thích danh mục (tổng, %)", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue(stats(1_000_000, 500_000));
    renderStats();

    // Assert
    expect(await screen.findByRole("heading", { name: "Thống kê" })).toBeInTheDocument();
    expect(screen.getByText("1.000.000 ₫")).toBeInTheDocument();
    expect(screen.getByText(/Tăng 100% so với tháng trước/)).toBeInTheDocument();
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
    expect(screen.getByText("Đi lại")).toBeInTheDocument();
    expect(screen.getByText("600.000 ₫ · 60%")).toBeInTheDocument();
    expect(screen.getByText("400.000 ₫ · 40%")).toBeInTheDocument();
    expect(fetchStatsMock).toHaveBeenCalledWith("f1", currentMonth());
  });

  it("giảm so với tháng trước → hiển thị % giảm", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue(stats(500_000, 1_000_000));
    renderStats();

    // Assert
    expect(await screen.findByRole("heading", { name: "Thống kê" })).toBeInTheDocument();
    expect(screen.getByText(/Giảm 50% so với tháng trước/)).toBeInTheDocument();
  });

  it("tháng không có data → empty state, không gọi chi tiết", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue(stats(0, 0));
    renderStats();

    // Assert
    expect(await screen.findByText("Chưa có dữ liệu tháng này")).toBeInTheDocument();
    expect(screen.queryByText("Tổng chi tiêu")).not.toBeInTheDocument();
  });

  it("lùi tháng → gọi API với tháng trước; ở tháng hiện tại nút tháng sau disable", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue(stats(0, 0));
    renderStats();
    await screen.findByText("Chưa có dữ liệu tháng này");

    // Assert — đang ở tháng hiện tại: không thể tiến lên
    expect(screen.getByRole("button", { name: "Tháng sau" })).toBeDisabled();

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Tháng trước" }));

    // Assert
    await waitFor(() => {
      expect(fetchStatsMock).toHaveBeenLastCalledWith("f1", addMonths(currentMonth(), -1));
    });
  });

  it("API lỗi → hiển thị thông báo lỗi", async () => {
    // Arrange
    fetchStatsMock.mockRejectedValue(new ApiError("NETWORK_ERROR", "Mất kết nối.", 0));
    renderStats();

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Mất kết nối.");
  });
});
