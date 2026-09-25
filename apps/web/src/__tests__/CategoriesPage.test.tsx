import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../core/api";
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
} from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import CategoriesPage from "../features/categories/CategoriesPage";

vi.mock("../core/dataApi", () => ({
  fetchCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

const fetchCategoriesMock = vi.mocked(fetchCategories);
const createCategoryMock = vi.mocked(createCategory);
const updateCategoryMock = vi.mocked(updateCategory);
const deleteCategoryMock = vi.mocked(deleteCategory);

const USER = { id: "u1", name: "An", email: "an@test.com" };
const FAMILY = {
  id: "f1",
  name: "Nhà An",
  inviteCode: "ABC123",
  ownerName: "An",
  memberCount: 2,
  myRole: "OWNER",
} as const;

const CAT_FOOD = { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 };
const CAT_ELEC = { id: "c2", name: "Tiền điện", icon: "⚡", isPreset: false, order: 1 };
const CAT_OTHER = { id: "c3", name: "Khác", icon: "📦", isPreset: true, order: 2 };
const LIST = [CAT_FOOD, CAT_ELEC, CAT_OTHER];

function nameInput() {
  return screen.getByPlaceholderText("VD: Tiền điện");
}

describe("Quản lý danh mục chi tiêu", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: USER, families: [FAMILY], activeFamilyId: FAMILY.id });
    fetchCategoriesMock.mockReset();
    createCategoryMock.mockReset();
    updateCategoryMock.mockReset();
    deleteCategoryMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("hiện list theo thứ tự; mọi hàng (kể cả preset) đủ 4 nút, không nhãn mặc định", async () => {
    // Arrange + Act
    fetchCategoriesMock.mockResolvedValue(LIST);
    render(<CategoriesPage />);
    const rows = await screen.findAllByRole("listitem");

    // Assert — thứ tự, không còn nhãn "Danh mục mặc định"
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Ăn uống");
    expect(rows[1]).toHaveTextContent("Tiền điện");
    expect(rows[2]).toHaveTextContent("Khác");
    expect(screen.queryAllByText("Danh mục mặc định")).toHaveLength(0);

    // Mọi hàng (kể cả preset) đều có đủ 4 nút hành động
    for (const row of rows) {
      expect(within(row).getAllByRole("button")).toHaveLength(4);
    }
    expect(within(rows[0]).getByRole("button", { name: "Sửa danh mục Ăn uống" })).toBeInTheDocument();
    expect(within(rows[0]).getByRole("button", { name: "Xoá danh mục Ăn uống" })).toBeInTheDocument();

    // Nút đầu/cuối list disable
    expect(within(rows[0]).getByRole("button", { name: "Đưa Ăn uống lên trên" })).toBeDisabled();
    expect(within(rows[2]).getByRole("button", { name: "Đưa Khác xuống dưới" })).toBeDisabled();
  });

  it("lần tải đầu hiện skeleton", () => {
    // Arrange + Act
    fetchCategoriesMock.mockReturnValue(new Promise(() => {}));
    render(<CategoriesPage />);

    // Assert
    expect(screen.getByRole("status", { name: "Đang tải" })).toBeInTheDocument();
  });

  it("fetch fail → màn lỗi + bấm 'Thử lại' gọi fetch lại", async () => {
    // Arrange
    fetchCategoriesMock
      .mockRejectedValueOnce(new ApiError("NETWORK_ERROR", "Không thể kết nối máy chủ.", 0))
      .mockResolvedValueOnce(LIST);
    render(<CategoriesPage />);

    // Assert lần đầu: màn lỗi
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể kết nối máy chủ.");

    // Act — thử lại
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    // Assert
    expect(await screen.findByText("Ăn uống")).toBeInTheDocument();
    expect(fetchCategoriesMock).toHaveBeenCalledTimes(2);
  });

  it("thêm OK: POST đúng payload, đóng modal, item mới cuối list", async () => {
    // Arrange
    const created = { id: "c9", name: "Tiền nước", icon: "💧", isPreset: false, order: 3 };
    fetchCategoriesMock
      .mockResolvedValueOnce(LIST)
      .mockResolvedValue([...LIST, created]); // refetch ngầm sau save
    createCategoryMock.mockResolvedValue(created);
    render(<CategoriesPage />);
    await screen.findByText("Ăn uống");

    // Act — mở modal, điền form, lưu
    fireEvent.click(screen.getByRole("button", { name: "Thêm danh mục" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(nameInput(), { target: { value: "Tiền nước" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Chọn biểu tượng 💧" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Thêm danh mục" }));

    // Assert
    expect(createCategoryMock).toHaveBeenCalledWith("f1", { name: "Tiền nước", icon: "💧" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Refetch ngầm sau save OK (đồng bộ read cache)
    expect(fetchCategoriesMock).toHaveBeenCalledTimes(2);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(rows[3]).toHaveTextContent("Tiền nước");
  });

  it("thêm tên dưới 2 ký tự → lỗi validate, không gọi API", async () => {
    // Arrange
    fetchCategoriesMock.mockResolvedValue(LIST);
    render(<CategoriesPage />);
    await screen.findByText("Ăn uống");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Thêm danh mục" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(nameInput(), { target: { value: "a" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Thêm danh mục" }));

    // Assert
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Tên phải từ 2 đến 30 ký tự");
    expect(createCategoryMock).not.toHaveBeenCalled();
  });

  it("thêm 409 trùng tên → lỗi dưới ô tên, modal giữ mở", async () => {
    // Arrange
    fetchCategoriesMock.mockResolvedValue(LIST);
    createCategoryMock.mockRejectedValue(
      new ApiError("CATEGORY_EXISTS", "Danh mục này đã tồn tại", 409),
    );
    render(<CategoriesPage />);
    await screen.findByText("Ăn uống");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Thêm danh mục" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(nameInput(), { target: { value: "Ăn uống" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Chọn biểu tượng 🍜" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Thêm danh mục" }));

    // Assert
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Danh mục này đã tồn tại");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("thêm offline → lỗi trong modal, modal giữ mở, không thêm vào list", async () => {
    // Arrange
    fetchCategoriesMock.mockResolvedValue(LIST);
    createCategoryMock.mockRejectedValue(
      new ApiError("NETWORK_ERROR", "Không thể kết nối máy chủ.", 0),
    );
    render(<CategoriesPage />);
    await screen.findByText("Ăn uống");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Thêm danh mục" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(nameInput(), { target: { value: "Tiền nước" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Chọn biểu tượng 💧" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Thêm danh mục" }));

    // Assert
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Không thể kết nối máy chủ.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Tiền nước")).not.toBeInTheDocument();
  });

  it("sửa danh mục: form pre-fill, lưu → PUT đúng payload, list cập nhật", async () => {
    // Arrange
    const updated = { ...CAT_ELEC, name: "Điện nước", icon: "💧" };
    fetchCategoriesMock
      .mockResolvedValueOnce(LIST)
      .mockResolvedValue(LIST.map((c) => (c.id === updated.id ? updated : c)));
    updateCategoryMock.mockResolvedValue(updated);
    render(<CategoriesPage />);
    await screen.findByText("Tiền điện");

    // Act — mở form sửa
    fireEvent.click(screen.getByRole("button", { name: "Sửa danh mục Tiền điện" }));
    const dialog = await screen.findByRole("dialog");
    expect(nameInput()).toHaveValue("Tiền điện");
    fireEvent.change(nameInput(), { target: { value: "Điện nước" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Chọn biểu tượng 💧" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));

    // Assert
    expect(updateCategoryMock).toHaveBeenCalledWith("f1", "c2", {
      name: "Điện nước",
      icon: "💧",
    });
    expect(await screen.findByText("Điện nước")).toBeInTheDocument();
    expect(screen.queryByText("Tiền điện")).not.toBeInTheDocument();
  });

  it("xoá: xác nhận trong dialog → DELETE, hàng biến mất", async () => {
    // Arrange
    fetchCategoriesMock
      .mockResolvedValueOnce(LIST)
      .mockResolvedValue([CAT_FOOD, CAT_OTHER]); // refetch ngầm sau xoá
    deleteCategoryMock.mockResolvedValue(undefined);
    render(<CategoriesPage />);
    await screen.findByText("Tiền điện");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Xoá danh mục Tiền điện" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Xoá danh mục "Tiền điện"/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Xoá" }));

    // Assert
    expect(deleteCategoryMock).toHaveBeenCalledWith("f1", "c2");
    await waitFor(() => expect(screen.queryByText("Tiền điện")).not.toBeInTheDocument());
    // Refetch ngầm sau xoá OK (đồng bộ read cache)
    expect(fetchCategoriesMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("huy xoá trong dialog → không gọi API", async () => {
    // Arrange
    fetchCategoriesMock.mockResolvedValue(LIST);
    render(<CategoriesPage />);
    await screen.findByText("Tiền điện");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Xoá danh mục Tiền điện" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Huỷ" }));

    // Assert
    expect(deleteCategoryMock).not.toHaveBeenCalled();
    expect(screen.getByText("Tiền điện")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("xoá 409 đang có khoản → dialog đóng + banner lỗi, hàng vẫn còn", async () => {
    // Arrange
    fetchCategoriesMock.mockResolvedValue(LIST);
    deleteCategoryMock.mockRejectedValue(
      new ApiError("CATEGORY_IN_USE", "Danh mục đang có khoản chi — không thể xoá", 409),
    );
    render(<CategoriesPage />);
    await screen.findByText("Tiền điện");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Xoá danh mục Tiền điện" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Xoá" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Danh mục đang có khoản chi");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Tiền điện")).toBeInTheDocument();
  });

  it("đổi thứ tự: nút xuống ở hàng giữa → 2 PUT swap order, list đổi vị trí", async () => {
    // Arrange
    fetchCategoriesMock.mockResolvedValue(LIST);
    updateCategoryMock.mockResolvedValue(CAT_ELEC);
    render(<CategoriesPage />);
    await screen.findByText("Tiền điện");

    // Act — "Tiền điện" (order 1) xuống dưới "Khác" (order 2)
    fireEvent.click(screen.getByRole("button", { name: "Đưa Tiền điện xuống dưới" }));

    // Assert — 2 PUT với order hoán đổi
    expect(updateCategoryMock).toHaveBeenNthCalledWith(1, "f1", "c2", { order: 2 });
    expect(updateCategoryMock).toHaveBeenNthCalledWith(2, "f1", "c3", { order: 1 });
    await waitFor(() => {
      const rows = screen.getAllByRole("listitem");
      expect(rows[1]).toHaveTextContent("Khác");
      expect(rows[2]).toHaveTextContent("Tiền điện");
    });
  });

  it("đổi thứ tự fail (1 PUT lỗi) → banner lỗi, list không đổi", async () => {
    // Arrange
    fetchCategoriesMock.mockResolvedValue(LIST);
    updateCategoryMock.mockRejectedValueOnce(
      new ApiError("CATEGORY_NOT_FOUND", "Không tìm thấy danh mục", 404),
    );
    render(<CategoriesPage />);
    await screen.findByText("Tiền điện");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Đưa Tiền điện xuống dưới" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tìm thấy danh mục");
    const rows = screen.getAllByRole("listitem");
    expect(rows[1]).toHaveTextContent("Tiền điện");
    expect(rows[2]).toHaveTextContent("Khác");
  });
});
