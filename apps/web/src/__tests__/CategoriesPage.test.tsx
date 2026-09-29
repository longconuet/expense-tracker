import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "@expense-tracker/shared";
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

const USER = { id: "u1", name: "An", username: "an2310" };
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

  it("row danh mục có gợi ý ghi chú → hiện chips; không có gợi ý (null/undefined) → không hiện", async () => {
    // Arrange — 1 category có gợi ý, 1 null (trạng thái thực tế sau normalize), 1 undefined (payload cũ)
    const CAT_NOTES = {
      id: "c9",
      name: "Đi lại",
      icon: "🚗",
      isPreset: false,
      order: 3,
      noteSuggestions: ["Đổ xăng", "Đặt xe"],
    };
    const CAT_NULL = { ...CAT_ELEC, noteSuggestions: null };
    fetchCategoriesMock.mockResolvedValue([CAT_NOTES, CAT_FOOD, CAT_NULL]);
    render(<CategoriesPage />);

    // Assert
    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[0]).getByText("Đổ xăng")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Đặt xe")).toBeInTheDocument();
    // "Ăn uống" (undefined) + "Tiền điện" (null) — không có chip
    expect(within(rows[1]).queryByText("Đổ xăng")).not.toBeInTheDocument();
    expect(within(rows[2]).queryByText("Đổ xăng")).not.toBeInTheDocument();
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
    expect(createCategoryMock).toHaveBeenCalledWith("f1", {
      name: "Tiền nước",
      icon: "💧",
      noteSuggestions: null,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 2000 });
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
      noteSuggestions: null,
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
    // Dialog vẫn mounted trong pha exit (message chứa "Tiền điện") → chờ đóng hẳn
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 2000 });
    expect(screen.queryByText("Tiền điện")).not.toBeInTheDocument();
    // Refetch ngầm sau xoá OK (đồng bộ read cache)
    expect(fetchCategoriesMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
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
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 2000 });
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
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 2000 });
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

describe("Gợi ý ghi chú nhanh trong modal thêm/sửa danh mục", () => {
  const CAT_CAR: Category = {
    id: "c4",
    name: "Đi lại",
    icon: "🚗",
    isPreset: true,
    order: 3,
    noteSuggestions: ["Đổ xăng", "Đặt xe"],
  };

  function noteInput() {
    return screen.getByPlaceholderText("VD: Đổ xăng");
  }

  function chipGroup() {
    return screen.getByRole("group", { name: "Gợi ý ghi chú hiện có" });
  }

  function addSuggestion(text: string, via: "enter" | "button" = "enter") {
    const input = noteInput();
    fireEvent.change(input, { target: { value: text } });
    if (via === "enter") {
      fireEvent.keyDown(input, { key: "Enter" });
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Thêm gợi ý ghi chú" }));
    }
  }

  async function openCreateDialog() {
    fetchCategoriesMock.mockResolvedValue(LIST);
    render(<CategoriesPage />);
    await screen.findByText("Ăn uống");
    fireEvent.click(screen.getByRole("button", { name: "Thêm danh mục" }));
    return screen.findByRole("dialog");
  }

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

  it("tạo: gõ gợi ý + Enter → chip hiện ngay, input trả về trống", async () => {
    // Arrange
    await openCreateDialog();

    // Act
    fireEvent.change(noteInput(), { target: { value: "Đổ xăng" } });
    fireEvent.keyDown(noteInput(), { key: "Enter" });

    // Assert
    expect(within(chipGroup()).getByText("Đổ xăng")).toBeInTheDocument();
    expect(noteInput()).toHaveValue("");
  });

  it("tạo: gợi ý trùng case-insensitive → không thêm chip thứ 2", async () => {
    // Arrange
    await openCreateDialog();
    addSuggestion("Đổ xăng");

    // Act — thêm "đổ xăng" (chữ thường) bằng nút
    addSuggestion("đổ xăng", "button");

    // Assert — vẫn chỉ 1 chip "Đổ xăng", không có chip "đổ xăng"
    expect(screen.getAllByText("Đổ xăng")).toHaveLength(1);
    expect(screen.queryByText("đổ xăng")).toBeNull();
  });

  it("tạo: đủ 8 gợi ý thì chặn mục 9 (nút Thêm disabled)", async () => {
    // Arrange
    await openCreateDialog();
    for (let i = 1; i <= 8; i++) addSuggestion(`Gợi ý ${i}`);
    expect(within(chipGroup()).getAllByRole("button")).toHaveLength(8);

    // Act
    addSuggestion("Gợi ý 9");

    // Assert — vẫn 8 chip, không thêm mục 9
    expect(within(chipGroup()).getAllByRole("button")).toHaveLength(8);
    expect(screen.queryByRole("button", { name: "Gợi ý 9" })).toBeNull();
    expect(screen.getByRole("button", { name: "Thêm gợi ý ghi chú" })).toBeDisabled();
  });

  it("tạo: xoá chip bằng nút × → chip biến mất", async () => {
    // Arrange
    await openCreateDialog();
    addSuggestion("Đổ xăng");
    addSuggestion("Đặt xe");

    // Act
    fireEvent.click(screen.getByRole("button", { name: 'Xoá gợi ý "Đổ xăng"' }));

    // Assert
    expect(screen.queryByText("Đổ xăng")).toBeNull();
    expect(within(chipGroup()).getByText("Đặt xe")).toBeInTheDocument();
  });

  it("lưu với 2 gợi ý (có khoảng trắng thừa) → payload array đã trim", async () => {
    // Arrange
    const created = { id: "c9", name: "Đi lại", icon: "🚗", isPreset: false, order: 3, noteSuggestions: ["Đổ xăng", "Đặt xe"] };
    fetchCategoriesMock.mockResolvedValue(LIST);
    createCategoryMock.mockResolvedValue(created);
    render(<CategoriesPage />);
    await screen.findByText("Ăn uống");
    fireEvent.click(screen.getByRole("button", { name: "Thêm danh mục" }));
    const dialog = await screen.findByRole("dialog");

    // Act
    fireEvent.change(nameInput(), { target: { value: "Đi lại" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Chọn biểu tượng 🚗" }));
    addSuggestion("  Đổ xăng  ");
    addSuggestion("Đặt xe");
    fireEvent.click(within(dialog).getByRole("button", { name: "Thêm danh mục" }));

    // Assert
    expect(createCategoryMock).toHaveBeenCalledWith("f1", {
      name: "Đi lại",
      icon: "🚗",
      noteSuggestions: ["Đổ xăng", "Đặt xe"],
    });
  });

  it("sửa: mở modal category có gợi ý → pre-fill đúng chips", async () => {
    // Arrange
    fetchCategoriesMock.mockResolvedValue([CAT_FOOD, CAT_CAR]);
    render(<CategoriesPage />);
    await screen.findByText("Đi lại");

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Sửa danh mục Đi lại" }));
    await screen.findByRole("dialog");

    // Assert
    expect(within(chipGroup()).getByText("Đổ xăng")).toBeInTheDocument();
    expect(within(chipGroup()).getByText("Đặt xe")).toBeInTheDocument();
    expect(nameInput()).toHaveValue("Đi lại");
  });

  it("sửa: xoá hết chips rồi lưu → payload noteSuggestions = null", async () => {
    // Arrange
    fetchCategoriesMock.mockResolvedValue([CAT_FOOD, CAT_CAR]);
    updateCategoryMock.mockResolvedValue(CAT_CAR);
    render(<CategoriesPage />);
    await screen.findByText("Đi lại");
    fireEvent.click(screen.getByRole("button", { name: "Sửa danh mục Đi lại" }));
    const dialog = await screen.findByRole("dialog");

    // Act — xoá cả 2 gợi ý rồi lưu (giữ nguyên tên/icon)
    fireEvent.click(screen.getByRole("button", { name: 'Xoá gợi ý "Đổ xăng"' }));
    fireEvent.click(screen.getByRole("button", { name: 'Xoá gợi ý "Đặt xe"' }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));

    // Assert
    expect(updateCategoryMock).toHaveBeenCalledWith("f1", "c4", {
      name: "Đi lại",
      icon: "🚗",
      noteSuggestions: null,
    });
  });
});
