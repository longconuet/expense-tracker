import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/dataApi", () => ({
  fetchCategories: vi.fn(),
  createExpense: vi.fn(),
}));

import { createExpense, fetchCategories } from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import { ApiError } from "../core/api";
import AddPage from "../features/expenses/AddPage";

const fetchCategoriesMock = vi.mocked(fetchCategories);
const createExpenseMock = vi.mocked(createExpense);

const CATS = [
  { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 },
  { id: "c2", name: "Đi lại", icon: "🚗", isPreset: true, order: 1 },
];

function renderAdd() {
  return render(
    <MemoryRouter initialEntries={["/add"]}>
      <Routes>
        <Route path="/add" element={<AddPage />} />
        <Route path="/" element={<div>HOME MARKER</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Gõ số tiền qua keypad (bấm từng phím số như trên màn hình). */
async function typeAmount(value: string) {
  await screen.findByRole("button", { name: "Ăn uống" }); // chờ danh mục tải xong
  for (const digit of value) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }
}

describe("Màn thêm khoản chi (keypad)", () => {
  beforeEach(() => {
    useAuthStore.setState({ activeFamilyId: "f1" });
    fetchCategoriesMock.mockReset();
    createExpenseMock.mockReset();
    fetchCategoriesMock.mockResolvedValue(CATS);
  });

  afterEach(() => {
    cleanup();
  });

  it("gõ số qua keypad + chọn danh mục + ghi chú → createExpense đúng payload, về trang chủ", async () => {
    // Arrange + Act
    createExpenseMock.mockResolvedValue({ expense: { id: "e1" }, savedOffline: false } as never);
    renderAdd();
    await typeAmount("50000");
    fireEvent.click(screen.getByRole("button", { name: "Ăn uống" }));
    fireEvent.change(screen.getByLabelText("Ghi chú (không bắt buộc)"), {
      target: { value: "cơm trưa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu khoản chi" }));

    // Assert
    expect(fetchCategoriesMock).toHaveBeenCalledWith("f1");
    expect(createExpenseMock).toHaveBeenCalledWith({
      familyId: "f1",
      category: expect.objectContaining({ id: "c1" }),
      amount: 50000,
      date: expect.any(String),
      note: "cơm trưa",
    });
    expect(await screen.findByText("HOME MARKER")).toBeInTheDocument();
  });

  it("nút Lưu disable khi thiếu, sáng lên khi đủ số + danh mục", async () => {
    // Arrange + Act
    renderAdd();
    const save = (await screen.findByRole("button", { name: "Lưu khoản chi" })) as HTMLButtonElement;

    // Assert — ban đầu: thiếu cả số lẫn danh mục
    expect(save).toBeDisabled();

    // Act — đủ số, chưa có danh mục
    await typeAmount("10000");

    // Assert
    expect(save).toBeDisabled();

    // Act — chọn danh mục
    fireEvent.click(screen.getByRole("button", { name: "Ăn uống" }));

    // Assert
    expect(save).toBeEnabled();
  });

  it("phím xoá (backspace) cắt chữ số cuối", async () => {
    // Arrange + Act
    renderAdd();
    await typeAmount("5000");
    fireEvent.click(screen.getByRole("button", { name: "Xoá 1 chữ số" }));

    // Assert — hiển thị 500 (format vi-VN)
    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("chỉ nhận tối đa 9 chữ số", async () => {
    // Arrange + Act
    renderAdd();
    await typeAmount("1234567891"); // 10 phím — phím cuối bị bỏ

    // Assert
    expect(screen.getByText("123.456.789")).toBeInTheDocument();
  });

  it("bàn phím vật lý: phím số gõ thẳng vào số tiền", async () => {
    // Arrange + Act
    renderAdd();
    await screen.findByRole("button", { name: "Ăn uống" });
    fireEvent.keyDown(window, { key: "5" });
    fireEvent.keyDown(window, { key: "0" });
    fireEvent.keyDown(window, { key: "Backspace" });

    // Assert — đọc vùng hiển thị số tiền (aria-live), tránh đụng phím "5" của keypad
    const display = document.querySelector('[aria-live="polite"]');
    expect(display?.textContent).toBe("5");
  });

  it("server không có mạng → lưu offline, vẫn về trang chủ", async () => {
    // Arrange
    createExpenseMock.mockResolvedValue({ expense: null, savedOffline: true });
    renderAdd();

    // Act
    await typeAmount("20000");
    fireEvent.click(screen.getByRole("button", { name: "Ăn uống" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu khoản chi" }));

    // Assert
    expect(await screen.findByText("HOME MARKER")).toBeInTheDocument();
  });

  it("API trả lỗi → hiển thị thông báo lỗi, không rời màn hình", async () => {
    // Arrange
    createExpenseMock.mockRejectedValue(
      new ApiError("VALIDATION_ERROR", "date không phải ngày hợp lệ", 400),
    );
    renderAdd();
    await typeAmount("10000");
    fireEvent.click(screen.getByRole("button", { name: "Đi lại" }));

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Lưu khoản chi" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("date không phải ngày hợp lệ");
    expect(screen.queryByText("HOME MARKER")).not.toBeInTheDocument();
  });
});
