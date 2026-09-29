import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/dataApi", () => ({
  fetchCategories: vi.fn(),
  fetchExpense: vi.fn(),
  updateExpense: vi.fn(),
}));

import { fetchCategories, fetchExpense, updateExpense } from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import { ApiError } from "../core/api";
import EditPage from "../features/expenses/EditPage";

const fetchCategoriesMock = vi.mocked(fetchCategories);
const fetchExpenseMock = vi.mocked(fetchExpense);
const updateExpenseMock = vi.mocked(updateExpense);

const CATS = [
  { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 },
  { id: "c2", name: "Đi lại", icon: "🚗", isPreset: true, order: 1 },
];

const EXPENSE = {
  id: "e1",
  amount: 50_000,
  date: "2026-09-20",
  note: "xăng",
  category: { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 },
  createdByName: "An",
  createdAt: "2026-09-20T06:00:00.000Z",
};

function renderEdit() {
  return render(
    <MemoryRouter initialEntries={["/expenses/e1/edit"]}>
      <Routes>
        <Route path="/expenses/:id/edit" element={<EditPage />} />
        <Route path="/history" element={<div>HISTORY MARKER</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function pressBackspaces(count: number) {
  for (let i = 0; i < count; i++) {
    fireEvent.click(screen.getByRole("button", { name: "Xoá 1 chữ số" }));
  }
}

function typeAmount(value: string) {
  for (const digit of value) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }
}

describe("Màn sửa khoản chi", () => {
  beforeEach(() => {
    useAuthStore.setState({ activeFamilyId: "f1" });
    fetchCategoriesMock.mockReset();
    fetchExpenseMock.mockReset();
    updateExpenseMock.mockReset();
    fetchCategoriesMock.mockResolvedValue(CATS);
    fetchExpenseMock.mockResolvedValue(EXPENSE);
  });

  afterEach(() => {
    cleanup();
  });

  it("tải khoản chi và pre-fill đủ trường (số tiền, danh mục, ngày, ghi chú)", async () => {
    // Arrange + Act
    renderEdit();

    // Assert
    expect(await screen.findByText("50.000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ăn uống" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Đi lại" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByLabelText("Ngày")).toHaveValue("2026-09-20");
    expect(screen.getByLabelText("Ghi chú (không bắt buộc)")).toHaveValue("xăng");
  });

  it("đổi số tiền qua keypad + danh mục + ngày → updateExpense payload đúng, về lịch sử", async () => {
    // Arrange
    updateExpenseMock.mockResolvedValue(EXPENSE);
    renderEdit();
    await screen.findByText("50.000");

    // Act — xoá số cũ, gõ số mới, đổi danh mục + ngày
    pressBackspaces(5);
    typeAmount("45000");
    fireEvent.click(screen.getByRole("button", { name: "Đi lại" }));
    fireEvent.change(screen.getByLabelText("Ngày"), { target: { value: "2026-09-21" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    // Assert
    expect(updateExpenseMock).toHaveBeenCalledWith(
      "e1",
      "f1",
      {
        amount: 45_000,
        categoryId: "c2",
        date: "2026-09-21",
        note: "xăng",
      },
      "2026-09-20",
    );
    expect(await screen.findByText("HISTORY MARKER")).toBeInTheDocument();
  });

  it("nút Lưu disabled khi số tiền về 0", async () => {
    // Arrange
    renderEdit();
    const save = (await screen.findByRole("button", { name: "Lưu thay đổi" })) as HTMLButtonElement;

    // Assert — pre-fill đủ → enable
    expect(save).toBeEnabled();

    // Act — xoá hết 5 chữ số
    pressBackspaces(5);

    // Assert
    expect(save).toBeDisabled();
  });

  it("xoá số tiền rồi gõ dở → chip gợi ý hiện; bấm chip → điền luôn giá trị", async () => {
    // Arrange
    renderEdit();
    await screen.findByText("50.000");

    // Act — xoá hết số cũ, gõ "2"
    pressBackspaces(5);
    fireEvent.click(screen.getByRole("button", { name: "2" }));

    // Assert — chip gợi ý nhãn compact, aria-label giá trị đầy đủ
    expect(screen.getByRole("button", { name: "Gợi ý 2.000 ₫" }).textContent).toBe("2k");
    expect(screen.getByRole("button", { name: "Gợi ý 20.000 ₫" }).textContent).toBe("20k");

    // Act — bấm chip 20k
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý 20.000 ₫" }));

    // Assert — số tiền được điền
    expect(screen.getByText("20.000")).toBeInTheDocument();
  });

  it("bấm phím 'C' → xoá toàn bộ số tiền, nút Lưu disabled", async () => {
    // Arrange
    renderEdit();
    await screen.findByText("50.000");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Xoá toàn bộ" }));

    // Assert — hiển thị về 0 (đọc qua aria-live, tránh đụng phím "0" của keypad)
    expect(screen.queryByText("50.000")).not.toBeInTheDocument();
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
  });

  it("khung gợi ý giữ chiều cao cố định — không nhảy layout khi ẩn/hiện gợi ý", async () => {
    // Arrange — pre-fill 50000 → khung gợi ý có chip
    renderEdit();
    await screen.findByText("50.000");
    const frame = screen.getByTestId("suggestions-frame");
    expect(frame).toContainElement(screen.getByRole("group", { name: "Gợi ý số tiền" }));

    // Act — xoá toàn bộ số tiền → không còn gợi ý
    fireEvent.click(screen.getByRole("button", { name: "Xoá toàn bộ" }));

    // Assert — nhóm gợi ý biến mất nhưng CÙNG khung (chiều cao cố định)
    expect(screen.queryByRole("group", { name: "Gợi ý số tiền" })).not.toBeInTheDocument();
    const fixedFrame = screen.getByTestId("suggestions-frame");
    expect(fixedFrame).toBe(frame);
    expect(fixedFrame).toHaveClass("h-[34px]");
  });

  it("API trả 403 khi lưu → hiện thông báo, không rời màn hình", async () => {
    // Arrange
    updateExpenseMock.mockRejectedValue(
      new ApiError(
        "FORBIDDEN",
        "Chỉ người tạo hoặc chủ gia đình mới sửa/xoá được khoản chi này",
        403,
      ),
    );
    renderEdit();
    await screen.findByText("50.000");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Chỉ người tạo hoặc chủ gia đình",
    );
    expect(screen.queryByText("HISTORY MARKER")).not.toBeInTheDocument();
  });

  it("khoản không tồn tại (404) → hiện thông báo + link quay lại lịch sử", async () => {
    // Arrange
    fetchExpenseMock.mockRejectedValue(
      new ApiError("EXPENSE_NOT_FOUND", "Không tìm thấy khoản chi", 404),
    );
    renderEdit();

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tìm thấy khoản chi");
    expect(screen.getByRole("link", { name: "Quay lại lịch sử" })).toHaveAttribute(
      "href",
      "/history",
    );
  });
});
