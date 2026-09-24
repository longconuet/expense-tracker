import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCategories, fetchExpenses, deleteExpense } from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import { ApiError } from "../core/api";
import { addMonths, currentMonth, today, yesterday } from "../core/dates";
import { SYNCED_EVENT } from "../core/syncQueue";
import HistoryPage from "../features/history/HistoryPage";

vi.mock("../core/dataApi", () => ({
  fetchCategories: vi.fn(),
  fetchExpenses: vi.fn(),
  deleteExpense: vi.fn(),
}));

const fetchCategoriesMock = vi.mocked(fetchCategories);
const fetchExpensesMock = vi.mocked(fetchExpenses);
const deleteExpenseMock = vi.mocked(deleteExpense);

const USER = { id: "u1", name: "An", email: "an@test.com" };
const FAMILY = {
  id: "f1",
  name: "Nhà An",
  inviteCode: "ABC123",
  ownerName: "An",
  memberCount: 2,
  myRole: "OWNER",
} as const;

const CAT = { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 };

function expense(id: string, note: string, amount: number, createdByName = "An", date = today()) {
  return {
    id,
    amount,
    date,
    note,
    category: CAT,
    createdByName,
    createdAt: `${date}T06:00:00.000Z`,
  };
}

const PAGE1 = [
  expense("e1", "cơm trưa", 50_000),
  expense("e2", "xăng", 200_000, "An", yesterday()),
];
const PAGE2 = [expense("e3", "thuốc", 80_000, "Bình", yesterday())];

function renderHistory() {
  return render(
    <MemoryRouter initialEntries={["/history"]}>
      <HistoryPage />
    </MemoryRouter>,
  );
}

/** Render kèm route màn sửa để verify điều hướng khi chạm khoản. */
function renderHistoryWithEditRoute() {
  return render(
    <MemoryRouter initialEntries={["/history"]}>
      <Routes>
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/expenses/:id/edit" element={<div>EDIT SCREEN MARKER</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Lịch sử chi tiêu", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: USER, families: [FAMILY], activeFamilyId: FAMILY.id });
    fetchCategoriesMock.mockReset();
    fetchExpensesMock.mockReset();
    deleteExpenseMock.mockReset();
    fetchCategoriesMock.mockResolvedValue([CAT]);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("hiện danh sách khoản chi + nút tải thêm khi còn data", async () => {
    // Arrange
    fetchExpensesMock.mockImplementation(async (_fid, params) => {
      if (params?.page === 1) {
        return { expenses: PAGE1, meta: { page: 1, pageSize: 20, total: 5 } };
      }
      return { expenses: PAGE2, meta: { page: 2, pageSize: 20, total: 5 } };
    });
    renderHistory();

    // Assert
    expect(await screen.findByText("cơm trưa")).toBeInTheDocument();
    // Nhóm theo ngày: "50.000 ₫" hiện 2 lần (dòng khoản + tiểu kết ngày)
    expect(screen.getByRole("heading", { name: "Hôm nay" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hôm qua" })).toBeInTheDocument();
    expect(screen.getAllByText("50.000 ₫")).toHaveLength(2);
    const loadMore = screen.getByRole("button", { name: /Tải thêm \(2\/5\)/ });
    fireEvent.click(loadMore);

    expect(await screen.findByText("thuốc")).toBeInTheDocument();
    expect(fetchExpensesMock).toHaveBeenLastCalledWith("f1", expect.objectContaining({ page: 2 }));
    expect(screen.getByRole("button", { name: /Tải thêm \(3\/5\)/ })).toBeInTheDocument();
  });

  it("lùi tháng → gọi API với tháng trước", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    renderHistory();
    await screen.findByText("Chưa có khoản chi tháng này");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Tháng trước" }));

    // Assert
    await waitFor(() => {
      expect(fetchExpensesMock).toHaveBeenLastCalledWith(
        "f1",
        expect.objectContaining({ month: addMonths(currentMonth(), -1) }),
      );
    });
  });

  it("tháng hiện tại → nút tháng sau bị disable", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    renderHistory();
    await screen.findByText("Chưa có khoản chi tháng này");

    // Assert
    expect(screen.getByRole("button", { name: "Tháng sau" })).toBeDisabled();
  });

  it("bấm chip danh mục → lọc lại theo categoryId", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    renderHistory();
    await screen.findByText("Chưa có khoản chi tháng này");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Ăn uống" }));

    // Assert
    await waitFor(() => {
      expect(fetchExpensesMock).toHaveBeenLastCalledWith(
        "f1",
        expect.objectContaining({ categoryId: "c1" }),
      );
    });
  });

  it("xoá khoản có xác nhận → gọi API + gỡ khỏi danh sách", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: PAGE1,
      meta: { page: 1, pageSize: 20, total: 2 },
    });
    deleteExpenseMock.mockResolvedValue(undefined);
    renderHistory();
    await screen.findByText("cơm trưa");

    // Act
    fireEvent.click(screen.getByRole("button", { name: /Xoá khoản cơm trưa/ }));

    // Assert
    expect(deleteExpenseMock).toHaveBeenCalledWith("e1");
    expect(await screen.findByText("xăng")).toBeInTheDocument();
    expect(screen.queryByText("cơm trưa")).not.toBeInTheDocument();
  });

  it("huy xác nhận xoá → không gọi API", async () => {
    // Arrange
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    fetchExpensesMock.mockResolvedValue({
      expenses: PAGE1,
      meta: { page: 1, pageSize: 20, total: 2 },
    });
    renderHistory();
    await screen.findByText("cơm trưa");

    // Act
    fireEvent.click(screen.getByRole("button", { name: /Xoá khoản cơm trưa/ }));

    // Assert
    expect(deleteExpenseMock).not.toHaveBeenCalled();
    expect(screen.getByText("cơm trưa")).toBeInTheDocument();
  });

  it("chạm khoản (owner) → điều hướng sang màn sửa /expenses/:id/edit", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: [expense("e1", "cơm trưa", 50_000)],
      meta: { page: 1, pageSize: 20, total: 1 },
    });
    renderHistoryWithEditRoute();

    // Act
    const link = await screen.findByRole("link", { name: /cơm trưa/ });
    expect(link).toHaveAttribute("href", "/expenses/e1/edit");
    fireEvent.click(link);

    // Assert
    expect(await screen.findByText("EDIT SCREEN MARKER")).toBeInTheDocument();
  });

  it("member không phải người tạo → khoản không phải link, không có nút xoá", async () => {
    // Arrange
    useAuthStore.setState({
      user: { id: "u2", name: "Bình", email: "binh@test.com" },
      families: [{ ...FAMILY, myRole: "MEMBER" }],
      activeFamilyId: FAMILY.id,
    });
    fetchExpensesMock.mockResolvedValue({
      expenses: [expense("e1", "cơm trưa", 50_000, "An")],
      meta: { page: 1, pageSize: 20, total: 1 },
    });
    renderHistory();

    // Act + Assert
    expect(await screen.findByText("cơm trưa")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Xoá khoản/ })).not.toBeInTheDocument();
  });

  it("tải lần đầu → skeleton (không spinner), giữ tiêu đề + selector + chip lọc", async () => {
    // Arrange — fetch không bao giờ resolve
    fetchExpensesMock.mockImplementation(() => new Promise(() => {}));
    renderHistory();

    // Assert
    expect(await screen.findByRole("status", { name: "Đang tải" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lịch sử chi tiêu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tháng trước" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ăn uống" })).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeNull();
  });

  it("đổi tháng → skeleton lại (query mới), fetch pending không giữ list cũ", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: PAGE1,
      meta: { page: 1, pageSize: 20, total: 2 },
    });
    renderHistory();
    await screen.findByText("cơm trưa");

    // Act — fetch tháng mới pending
    fetchExpensesMock.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Tháng trước" }));

    // Assert
    expect(screen.getByRole("status", { name: "Đang tải" })).toBeInTheDocument();
    expect(screen.queryByText("cơm trưa")).not.toBeInTheDocument();
  });

  it("sync offline → refetch lặng lẽ, GIỮ list cũ (không flicker)", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: PAGE1,
      meta: { page: 1, pageSize: 20, total: 2 },
    });
    renderHistory();
    await screen.findByText("cơm trưa");

    // Act — fetch mới pending + event sync
    fetchExpensesMock.mockImplementationOnce(() => new Promise(() => {}));
    act(() => {
      window.dispatchEvent(new Event(SYNCED_EVENT));
    });

    // Assert — list cũ vẫn hiển thị, không có skeleton
    expect(screen.getByText("cơm trưa")).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeNull();
    expect(fetchExpensesMock).toHaveBeenCalledTimes(2);
  });

  it("sync offline → refetch lỗi nhưng đã có data → giữ list + banner lỗi", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: PAGE1,
      meta: { page: 1, pageSize: 20, total: 2 },
    });
    renderHistory();
    await screen.findByText("cơm trưa");

    // Act — fetch mới lỗi
    fetchExpensesMock.mockRejectedValueOnce(new ApiError("NETWORK_ERROR", "Mất kết nối.", 0));
    act(() => {
      window.dispatchEvent(new Event(SYNCED_EVENT));
    });

    // Assert — list cũ vẫn hiển thị + banner lỗi, không có skeleton
    expect(await screen.findByRole("alert")).toHaveTextContent("Mất kết nối.");
    expect(screen.getByText("cơm trưa")).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });
});
