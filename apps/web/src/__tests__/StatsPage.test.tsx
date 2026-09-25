import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchExpenses, fetchStats } from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import { ApiError } from "../core/api";
import { addMonths, currentMonth } from "../core/dates";
import { SYNCED_EVENT } from "../core/syncQueue";
import StatsPage from "../features/stats/StatsPage";

vi.mock("../core/dataApi", () => ({
  fetchStats: vi.fn(),
  fetchExpenses: vi.fn(),
}));

const fetchStatsMock = vi.mocked(fetchStats);
const fetchExpensesMock = vi.mocked(fetchExpenses);

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
    // Số tiền khác byCategory để test không đụng nhau khi getByText
    byMember:
      total > 0
        ? [
            { name: "An", total: 550_000, percent: 55 },
            { name: "Bình", total: 450_000, percent: 45 },
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
    fetchExpensesMock.mockReset();
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

  it("card tổng hiện section Theo thành viên: tên + tổng + % từng member", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue(stats(1_000_000, 0));
    renderStats();

    // Assert
    expect(await screen.findByText("Theo thành viên")).toBeInTheDocument();
    expect(screen.getByText("An")).toBeInTheDocument();
    expect(screen.getByText("550.000 ₫ · 55%")).toBeInTheDocument();
    expect(screen.getByText("Bình")).toBeInTheDocument();
    expect(screen.getByText("450.000 ₫ · 45%")).toBeInTheDocument();
  });

  it("thành viên không có chi trong tháng vẫn hiện với 0 ₫", async () => {
    // Arrange
    const data = stats(1_000_000, 0);
    data.byMember = [
      { name: "An", total: 1_000_000, percent: 100 },
      { name: "Bình", total: 0, percent: 0 },
    ];
    fetchStatsMock.mockResolvedValue(data);
    renderStats();

    // Assert
    expect(await screen.findByText("Theo thành viên")).toBeInTheDocument();
    expect(screen.getByText("1.000.000 ₫ · 100%")).toBeInTheDocument();
    expect(screen.getByText("0 ₫ · 0%")).toBeInTheDocument();
  });

  it("byMember rỗng → không render section, card tổng vẫn bình thường", async () => {
    // Arrange — payload byMember = [] (trường hợp fetchStats normalize payload offline cũ)
    const data = stats(1_000_000, 0);
    data.byMember = [];
    fetchStatsMock.mockResolvedValue(data);
    renderStats();

    // Assert
    expect(await screen.findByText("1.000.000 ₫")).toBeInTheDocument();
    expect(screen.queryByText("Theo thành viên")).not.toBeInTheDocument();
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

  it("lịch: click ngày có chi → mở popup chi tiết + fetch đúng ngày; đóng lại được", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue(stats(1_000_000, 0));
    fetchExpensesMock.mockResolvedValue({
      expenses: [
        {
          id: "e1",
          amount: 350_000,
          date: `${currentMonth()}-10`,
          note: "Tiệc liên hoan",
          category: CAT_A,
          createdByName: "An",
          createdAt: "2026-09-10T04:00:00.000Z",
        },
        {
          id: "e2",
          amount: 250_000,
          date: `${currentMonth()}-10`,
          note: null,
          category: CAT_B,
          createdByName: "Bình",
          createdAt: "2026-09-10T05:00:00.000Z",
        },
      ],
      meta: { page: 1, pageSize: 100, total: 2 },
    });
    renderStats();
    await screen.findByText("1.000.000 ₫");

    // Act — click ngày 10 (byDay có 600k)
    fireEvent.click(screen.getByRole("button", { name: "Ngày 10, chi tiêu 600.000 ₫" }));

    // Assert — popup hiện, fetch đúng ngày, list chi tiết đủ 2 khoản
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Tổng")).toBeInTheDocument();
    expect(within(dialog).getByText("600.000 ₫")).toBeInTheDocument();
    expect(within(dialog).getByText("Tiệc liên hoan")).toBeInTheDocument();
    expect(within(dialog).getByText("350.000 ₫")).toBeInTheDocument();
    expect(within(dialog).getByText("250.000 ₫")).toBeInTheDocument();
    expect(fetchExpensesMock).toHaveBeenCalledWith("f1", {
      date: `${currentMonth()}-10`,
      page: 1,
      pageSize: 100,
    });

    // Act — đóng popup
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));

    // Assert
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("đổi tháng khi đang mở popup → đóng popup (ngày cũ không thuộc view)", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue(stats(1_000_000, 0));
    fetchExpensesMock.mockResolvedValue({ expenses: [], meta: { page: 1, pageSize: 100, total: 0 } });
    renderStats();
    await screen.findByText("1.000.000 ₫");
    fireEvent.click(screen.getByRole("button", { name: "Ngày 10, chi tiêu 600.000 ₫" }));
    await screen.findByRole("dialog");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Tháng trước" }));

    // Assert
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tải lần đầu → skeleton (không spinner), selector tháng vẫn hoạt động", async () => {
    // Arrange — fetch không bao giờ resolve
    fetchStatsMock.mockImplementation(() => new Promise(() => {}));
    renderStats();

    // Assert
    expect(await screen.findByRole("status", { name: "Đang tải" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tháng trước" })).toBeEnabled();
    expect(document.querySelector(".animate-spin")).toBeNull();
    // Skeleton đủ 3 card + section theo thành viên trong card tổng (≥ 12 khối)
    expect(document.querySelectorAll('[role="status"] .animate-pulse').length).toBeGreaterThanOrEqual(
      12,
    );
  });

  it("đổi tháng → skeleton lại (query mới), fetch pending không giữ data cũ", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue(stats(1_000_000, 500_000));
    renderStats();
    await screen.findByText("1.000.000 ₫");

    // Act — fetch tháng mới pending
    fetchStatsMock.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Tháng trước" }));

    // Assert
    expect(screen.getByRole("status", { name: "Đang tải" })).toBeInTheDocument();
    expect(screen.queryByText("1.000.000 ₫")).not.toBeInTheDocument();
  });

  it("sync offline → refetch lặng lẽ, GIỮ data cũ (không flicker)", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue(stats(1_000_000, 500_000));
    renderStats();
    await screen.findByText("1.000.000 ₫");

    // Act — fetch mới pending + event sync
    fetchStatsMock.mockImplementationOnce(() => new Promise(() => {}));
    act(() => {
      window.dispatchEvent(new Event(SYNCED_EVENT));
    });

    // Assert — data cũ vẫn hiển thị, không có skeleton
    expect(screen.getByText("1.000.000 ₫")).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeNull();
    expect(fetchStatsMock).toHaveBeenCalledTimes(2);
  });

  it("sync offline → refetch lỗi nhưng đã có data → giữ data + banner lỗi", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue(stats(1_000_000, 500_000));
    renderStats();
    await screen.findByText("1.000.000 ₫");

    // Act — fetch mới lỗi
    fetchStatsMock.mockRejectedValueOnce(new ApiError("NETWORK_ERROR", "Mất kết nối.", 0));
    act(() => {
      window.dispatchEvent(new Event(SYNCED_EVENT));
    });

    // Assert — data cũ vẫn hiển thị + banner lỗi, không có skeleton
    expect(await screen.findByRole("alert")).toHaveTextContent("Mất kết nối.");
    expect(screen.getByText("1.000.000 ₫")).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });
});
