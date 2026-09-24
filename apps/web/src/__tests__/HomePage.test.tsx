import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/dataApi", () => ({
  fetchStats: vi.fn(),
  fetchExpenses: vi.fn(),
}));

import { fetchExpenses, fetchStats } from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import { ApiError } from "../core/api";
import { SYNCED_EVENT } from "../core/syncQueue";
import { today, yesterday } from "../core/dates";
import HomePage from "../features/home/HomePage";

const fetchStatsMock = vi.mocked(fetchStats);
const fetchExpensesMock = vi.mocked(fetchExpenses);

const CAT = { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 };
const EXPENSE = {
  id: "e1",
  amount: 50000,
  date: yesterday(),
  note: "cơm trưa",
  category: CAT,
  createdByName: "An",
  createdAt: `${yesterday()}T06:00:00.000Z`,
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
    fetchExpensesMock.mockResolvedValue({
      expenses: [EXPENSE],
      meta: { page: 1, pageSize: 5, total: 1 },
    });
    renderHome();

    // Assert
    expect(await screen.findByRole("heading", { name: "Trang chủ" })).toBeInTheDocument();
    expect(screen.getByText("1.000.000 ₫")).toBeInTheDocument();
    expect(screen.getByText(/Tăng 100% so với tháng trước/)).toBeInTheDocument();
    expect(screen.getByText("600.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("cơm trưa")).toBeInTheDocument();
    // Khoản gần đây nhóm theo ngày: tiêu đề "Hôm qua" + tên người tạo
    expect(screen.getByRole("heading", { name: "Hôm qua" })).toBeInTheDocument();
    expect(screen.getByText("An")).toBeInTheDocument();
    expect(fetchStatsMock).toHaveBeenCalledWith("f1", expect.any(String));
    expect(fetchExpensesMock).toHaveBeenCalledWith("f1", expect.objectContaining({ pageSize: 5 }));
  });

  it("gần đây nhóm theo ngày, tiểu kết tổng ngày đúng", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue({
      month: "2026-09",
      total: 140_000,
      previousMonthTotal: 0,
      byCategory: [{ category: CAT, total: 140_000, percent: 100 }],
      byDay: [],
    });
    fetchExpensesMock.mockResolvedValue({
      expenses: [
        {
          id: "e1",
          amount: 30_000,
          date: today(),
          note: "cafe",
          category: CAT,
          createdByName: "An",
          createdAt: `${today()}T05:00:00.000Z`,
        },
        {
          id: "e2",
          amount: 50_000,
          date: today(),
          note: null,
          category: CAT,
          createdByName: "An",
          createdAt: `${today()}T04:00:00.000Z`,
        },
        {
          id: "e3",
          amount: 20_000,
          date: yesterday(),
          note: null,
          category: CAT,
          createdByName: "An",
          createdAt: `${yesterday()}T05:00:00.000Z`,
        },
        {
          id: "e4",
          amount: 40_000,
          date: yesterday(),
          note: null,
          category: CAT,
          createdByName: "An",
          createdAt: `${yesterday()}T04:00:00.000Z`,
        },
      ],
      meta: { page: 1, pageSize: 5, total: 4 },
    });
    renderHome();

    // Assert
    const todayHeader = await screen.findByRole("heading", { name: "Hôm nay" });
    expect(todayHeader).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hôm qua" })).toBeInTheDocument();
    // Tiểu kết: hôm nay 30k + 50k = 80.000 ₫; hôm qua 20k + 40k = 60.000 ₫
    expect(screen.getByText("80.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("60.000 ₫")).toBeInTheDocument();
    // Ngày mới nằm trước
    expect(
      todayHeader.compareDocumentPosition(screen.getByRole("heading", { name: "Hôm qua" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    expect(await screen.findByText("Chưa có khoản chi nào tháng này")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thêm khoản chi đầu tiên" })).toHaveAttribute(
      "href",
      "/add",
    );
  });

  it("API lỗi → hiển thị thông báo lỗi", async () => {
    // Arrange
    fetchStatsMock.mockRejectedValue(
      new ApiError("NETWORK_ERROR", "Không kết nối được máy chủ.", 0),
    );
    fetchExpensesMock.mockResolvedValue({ expenses: [], meta: { page: 1, pageSize: 5, total: 0 } });
    renderHome();

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Không kết nối được máy chủ.");
  });

  it("tải lần đầu → hiện skeleton (không spinner), tiêu đề + tháng hiện thật", async () => {
    // Arrange — 2 fetch không bao giờ resolve
    fetchStatsMock.mockImplementation(() => new Promise(() => {}));
    fetchExpensesMock.mockImplementation(() => new Promise(() => {}));
    renderHome();

    // Assert
    expect(await screen.findByRole("status", { name: "Đang tải" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trang chủ" })).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeNull();
  });

  it("sync offline → refetch lặng lẽ, GIỮ data cũ (không flicker)", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue({
      month: "2026-09",
      total: 1_000_000,
      previousMonthTotal: 500_000,
      byCategory: [{ category: CAT, total: 600_000, percent: 60 }],
      byDay: [],
    });
    fetchExpensesMock.mockResolvedValue({
      expenses: [EXPENSE],
      meta: { page: 1, pageSize: 5, total: 1 },
    });
    renderHome();
    await screen.findByText("cơm trưa");

    // Act — fetch mới pending + event sync
    fetchStatsMock.mockImplementationOnce(() => new Promise(() => {}));
    fetchExpensesMock.mockImplementationOnce(() => new Promise(() => {}));
    act(() => {
      window.dispatchEvent(new Event(SYNCED_EVENT));
    });

    // Assert — data cũ vẫn hiển thị, không có skeleton
    expect(screen.getByText("cơm trưa")).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeNull();
    expect(fetchStatsMock).toHaveBeenCalledTimes(2);
  });

  it("refetch ngầm lỗi nhưng đã có data → giữ data + banner lỗi", async () => {
    // Arrange
    fetchStatsMock.mockResolvedValue({
      month: "2026-09",
      total: 1_000_000,
      previousMonthTotal: 500_000,
      byCategory: [{ category: CAT, total: 600_000, percent: 60 }],
      byDay: [],
    });
    fetchExpensesMock.mockResolvedValue({
      expenses: [EXPENSE],
      meta: { page: 1, pageSize: 5, total: 1 },
    });
    renderHome();
    await screen.findByText("cơm trưa");

    // Act — fetch mới lỗi
    fetchStatsMock.mockRejectedValueOnce(new ApiError("NETWORK_ERROR", "Mất kết nối.", 0));
    fetchExpensesMock.mockResolvedValueOnce({
      expenses: [EXPENSE],
      meta: { page: 1, pageSize: 5, total: 1 },
    });
    act(() => {
      window.dispatchEvent(new Event(SYNCED_EVENT));
    });

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Mất kết nối.");
    expect(screen.getByText("cơm trưa")).toBeInTheDocument();
  });
});
