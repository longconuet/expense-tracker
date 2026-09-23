import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCategories, fetchExpenses, deleteExpense } from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import { addMonths, currentMonth } from "../core/dates";
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

function expense(id: string, note: string, amount: number, createdByName = "An") {
  return {
    id,
    amount,
    date: "2026-09-20",
    note,
    category: CAT,
    createdByName,
    createdAt: "2026-09-20T06:00:00.000Z",
  };
}

const PAGE1 = [expense("e1", "cơm trưa", 50_000), expense("e2", "xăng", 200_000)];
const PAGE2 = [expense("e3", "thuốc", 80_000, "Bình")];

function renderHistory() {
  return render(
    <MemoryRouter initialEntries={["/history"]}>
      <HistoryPage />
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
    vi.stubGlobal("confirm", vi.fn(() => true));
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
    expect(screen.getByText("50.000 ₫")).toBeInTheDocument();
    const loadMore = screen.getByRole("button", { name: /Tải thêm \(2\/5\)/ });
    fireEvent.click(loadMore);

    expect(await screen.findByText("thuốc")).toBeInTheDocument();
    expect(fetchExpensesMock).toHaveBeenLastCalledWith(
      "f1",
      expect.objectContaining({ page: 2 }),
    );
    expect(screen.getByRole("button", { name: /Tải thêm \(3\/5\)/ })).toBeInTheDocument();
  });

  it("lùi tháng → gọi API với tháng trước", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({ expenses: [], meta: { page: 1, pageSize: 20, total: 0 } });
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
    fetchExpensesMock.mockResolvedValue({ expenses: [], meta: { page: 1, pageSize: 20, total: 0 } });
    renderHistory();
    await screen.findByText("Chưa có khoản chi tháng này");

    // Assert
    expect(screen.getByRole("button", { name: "Tháng sau" })).toBeDisabled();
  });

  it("bấm chip danh mục → lọc lại theo categoryId", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({ expenses: [], meta: { page: 1, pageSize: 20, total: 0 } });
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
    fetchExpensesMock.mockResolvedValue({ expenses: PAGE1, meta: { page: 1, pageSize: 20, total: 2 } });
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
    vi.stubGlobal("confirm", vi.fn(() => false));
    fetchExpensesMock.mockResolvedValue({ expenses: PAGE1, meta: { page: 1, pageSize: 20, total: 2 } });
    renderHistory();
    await screen.findByText("cơm trưa");

    // Act
    fireEvent.click(screen.getByRole("button", { name: /Xoá khoản cơm trưa/ }));

    // Assert
    expect(deleteExpenseMock).not.toHaveBeenCalled();
    expect(screen.getByText("cơm trưa")).toBeInTheDocument();
  });
});
