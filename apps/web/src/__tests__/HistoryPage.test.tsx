import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCategories, fetchExpenses, deleteExpense, fetchFamilyDetail } from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import { ApiError } from "../core/api";
import { addMonths, currentMonth, today, yesterday } from "../core/dates";
import { SYNCED_EVENT } from "../core/syncQueue";
import HistoryPage from "../features/history/HistoryPage";

vi.mock("../core/dataApi", () => ({
  fetchCategories: vi.fn(),
  fetchExpenses: vi.fn(),
  deleteExpense: vi.fn(),
  fetchFamilyDetail: vi.fn(),
}));

const fetchCategoriesMock = vi.mocked(fetchCategories);
const fetchExpensesMock = vi.mocked(fetchExpenses);
const deleteExpenseMock = vi.mocked(deleteExpense);
const fetchFamilyDetailMock = vi.mocked(fetchFamilyDetail);

const USER = { id: "u1", name: "An", username: "an2310" };
const FAMILY = {
  id: "f1",
  name: "Nhà An",
  inviteCode: "ABC123",
  ownerName: "An",
  memberCount: 2,
  myRole: "OWNER",
} as const;

const FAMILY2 = {
  id: "f2",
  name: "Nhà Khác",
  inviteCode: "XYZ789",
  ownerName: "Chủ 2",
  memberCount: 2,
  myRole: "MEMBER",
} as const;

const CAT = { id: "c1", name: "Ăn uống", icon: "🍜", isPreset: true, order: 0 };

const MEMBER_AN = { userId: "u1", name: "An", role: "OWNER", joinedAt: "2026-09-01T00:00:00.000Z" } as const;
const MEMBER_BINH = { userId: "u2", name: "Bình", role: "MEMBER", joinedAt: "2026-09-02T00:00:00.000Z" } as const;

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
    fetchFamilyDetailMock.mockReset();
    fetchCategoriesMock.mockResolvedValue([CAT]);
    // Mặc định family 1 thành viên → hàng chip lọc thành viên ẩn (không đụng test cũ)
    fetchFamilyDetailMock.mockResolvedValue({ ...FAMILY, members: [MEMBER_AN] });
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

  it("family 2 thành viên → hiện chip lọc (Tất cả + 2 tên); 1 thành viên → ẩn", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    fetchFamilyDetailMock.mockResolvedValue({ ...FAMILY, members: [MEMBER_AN, MEMBER_BINH] });

    // Act
    renderHistory();
    const group = await screen.findByRole("group", { name: "Lọc theo thành viên" });

    // Assert — chip "Tất cả" active mặc định + 2 chip tên member
    expect(within(group).getByRole("button", { name: "Tất cả" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "An" })).toHaveAttribute("aria-pressed", "false");
    expect(within(group).getByRole("button", { name: "Bình" })).toHaveAttribute("aria-pressed", "false");

    // 1 thành viên → không hiện hàng chip
    cleanup();
    fetchFamilyDetailMock.mockResolvedValue({ ...FAMILY, members: [MEMBER_AN] });
    renderHistory();
    await screen.findByText("Chưa có khoản chi tháng này");
    expect(screen.queryByRole("group", { name: "Lọc theo thành viên" })).not.toBeInTheDocument();
  });

  it("bấm chip thành viên → fetch theo userId; bấm chip đang chọn → về 'Tất cả'", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    fetchFamilyDetailMock.mockResolvedValue({ ...FAMILY, members: [MEMBER_AN, MEMBER_BINH] });
    renderHistory();
    const group = await screen.findByRole("group", { name: "Lọc theo thành viên" });

    // Act — chọn "Bình"
    fireEvent.click(within(group).getByRole("button", { name: "Bình" }));

    // Assert
    await waitFor(() => {
      expect(fetchExpensesMock).toHaveBeenLastCalledWith(
        "f1",
        expect.objectContaining({ userId: "u2" }),
      );
    });
    expect(within(group).getByRole("button", { name: "Bình" })).toHaveAttribute("aria-pressed", "true");

    // Act — bấm lại chip đang chọn → reset
    fireEvent.click(within(group).getByRole("button", { name: "Bình" }));

    // Assert
    await waitFor(() => {
      const lastParams = fetchExpensesMock.mock.lastCall?.[1];
      expect(lastParams).toBeDefined();
      expect(lastParams?.userId).toBeUndefined();
    });
    expect(within(group).getByRole("button", { name: "Tất cả" })).toHaveAttribute("aria-pressed", "true");
  });

  it("kết hợp filter thành viên + danh mục → cả 2 param", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    fetchFamilyDetailMock.mockResolvedValue({ ...FAMILY, members: [MEMBER_AN, MEMBER_BINH] });
    renderHistory();
    const group = await screen.findByRole("group", { name: "Lọc theo thành viên" });
    await screen.findByText("Chưa có khoản chi tháng này");

    // Act
    fireEvent.click(within(group).getByRole("button", { name: "Bình" }));
    fireEvent.click(screen.getByRole("button", { name: "Ăn uống" }));

    // Assert
    await waitFor(() => {
      expect(fetchExpensesMock).toHaveBeenLastCalledWith(
        "f1",
        expect.objectContaining({ userId: "u2", categoryId: "c1" }),
      );
    });
  });

  it("không có khoản của thành viên đang lọc → thông báo kèm tên member", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    fetchFamilyDetailMock.mockResolvedValue({ ...FAMILY, members: [MEMBER_AN, MEMBER_BINH] });
    renderHistory();
    const group = await screen.findByRole("group", { name: "Lọc theo thành viên" });

    // Act
    fireEvent.click(within(group).getByRole("button", { name: "Bình" }));

    // Assert
    expect(await screen.findByText("Không có khoản chi của Bình tháng này")).toBeInTheDocument();
  });

  it("'Tải thêm' giữ filter thành viên (cùng userId, trang kế tiếp)", async () => {
    // Arrange
    fetchFamilyDetailMock.mockResolvedValue({ ...FAMILY, members: [MEMBER_AN, MEMBER_BINH] });
    fetchExpensesMock.mockImplementation(async (_fid, params) => {
      if (params?.page === 1) {
        return { expenses: [expense("e1", "cơm trưa", 50_000)], meta: { page: 1, pageSize: 20, total: 3 } };
      }
      return { expenses: [], meta: { page: 2, pageSize: 20, total: 3 } };
    });
    renderHistory();
    const group = await screen.findByRole("group", { name: "Lọc theo thành viên" });

    // Act — chọn "An" rồi tải thêm
    fireEvent.click(within(group).getByRole("button", { name: "An" }));
    await waitFor(() => expect(fetchExpensesMock).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: /Tải thêm \(1\/3\)/ }));

    // Assert
    await waitFor(() => {
      const lastParams = fetchExpensesMock.mock.lastCall?.[1];
      expect(lastParams).toMatchObject({ page: 2, userId: "u1" });
    });
  });

  it("đổi family khi đang lọc → reset về 'Tất cả', không fetch family mới với userId cũ", async () => {
    // Arrange — 2 family; đang lọc "Bình" ở family f1
    useAuthStore.setState({ user: USER, families: [FAMILY, FAMILY2], activeFamilyId: FAMILY.id });
    fetchFamilyDetailMock.mockResolvedValue({ ...FAMILY, members: [MEMBER_AN, MEMBER_BINH] });
    fetchExpensesMock.mockResolvedValue({
      expenses: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    renderHistory();
    const group = await screen.findByRole("group", { name: "Lọc theo thành viên" });
    fireEvent.click(within(group).getByRole("button", { name: "Bình" }));
    await waitFor(() => {
      expect(fetchExpensesMock).toHaveBeenLastCalledWith(
        "f1",
        expect.objectContaining({ userId: "u2" }),
      );
    });

    // Act — đổi sang family khác
    act(() => {
      useAuthStore.setState({ activeFamilyId: FAMILY2.id });
    });

    // Assert — mọi request của f2 đều KHÔNG kèm userId cũ; chip về "Tất cả"
    await waitFor(() => {
      const f2Calls = fetchExpensesMock.mock.calls.filter(([fid]) => fid === "f2");
      expect(f2Calls.length).toBeGreaterThan(0);
      expect(f2Calls.every(([, params]) => params?.userId === undefined)).toBe(true);
    });
    expect(
      within(screen.getByRole("group", { name: "Lọc theo thành viên" })).getByRole("button", {
        name: "Tất cả",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("member đang lọc bị xoá khỏi family (404) → tự reset về 'Tất cả' + refresh chip, không hiện lỗi", async () => {
    // Arrange — lần 2 gọi fetchFamilyDetail trả family chỉ còn An (Bình đã bị xoá)
    let membersCalls = 0;
    fetchFamilyDetailMock.mockImplementation(async () => {
      membersCalls += 1;
      return {
        ...FAMILY,
        members: membersCalls === 1 ? [MEMBER_AN, MEMBER_BINH] : [MEMBER_AN],
      };
    });
    fetchExpensesMock.mockImplementation(async (_fid, params) => {
      if (params?.userId === "u2") {
        throw new ApiError("USER_NOT_IN_FAMILY", "Thành viên không thuộc gia đình này", 404);
      }
      return { expenses: [], meta: { page: 1, pageSize: 20, total: 0 } };
    });
    renderHistory();
    const group = await screen.findByRole("group", { name: "Lọc theo thành viên" });

    // Act — chọn "Bình" → fetch 404 → tự phục hồi
    fireEvent.click(within(group).getByRole("button", { name: "Bình" }));
    await waitFor(() => {
      const lastParams = fetchExpensesMock.mock.lastCall?.[1];
      expect(lastParams?.userId).toBeUndefined(); // đã refetch về "Tất cả"
    });

    // Assert — không hiện banner lỗi; chip "Bình" biến mất (danh sách đã refresh)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(within(group).queryByRole("button", { name: "Bình" })).not.toBeInTheDocument();
    });
    expect(within(group).getByRole("button", { name: "Tất cả" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("xoá khoản qua dialog → gọi API + gỡ khỏi danh sách", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: PAGE1,
      meta: { page: 1, pageSize: 20, total: 2 },
    });
    deleteExpenseMock.mockResolvedValue(undefined);
    renderHistory();
    await screen.findByText("cơm trưa");

    // Act — mở dialog rồi bấm Xoá
    fireEvent.click(screen.getByRole("button", { name: /Xoá khoản cơm trưa/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Xoá khoản "cơm trưa" \(50.000 ₫\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));

    // Assert
    expect(deleteExpenseMock).toHaveBeenCalledWith("e1");
    expect(await screen.findByText("xăng")).toBeInTheDocument();
    expect(screen.queryByText("cơm trưa")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("huy xác nhận xoá trong dialog → không gọi API", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: PAGE1,
      meta: { page: 1, pageSize: 20, total: 2 },
    });
    renderHistory();
    await screen.findByText("cơm trưa");

    // Act
    fireEvent.click(screen.getByRole("button", { name: /Xoá khoản cơm trưa/ }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));

    // Assert
    expect(deleteExpenseMock).not.toHaveBeenCalled();
    expect(screen.getByText("cơm trưa")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("xoá khoản API fail → dialog đóng + hiện lỗi trên màn, khoản vẫn còn", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: PAGE1,
      meta: { page: 1, pageSize: 20, total: 2 },
    });
    deleteExpenseMock.mockRejectedValue(new ApiError("NETWORK_ERROR", "Xoá không thành công.", 0));
    renderHistory();
    await screen.findByText("cơm trưa");

    // Act
    fireEvent.click(screen.getByRole("button", { name: /Xoá khoản cơm trưa/ }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Xoá không thành công.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("cơm trưa")).toBeInTheDocument();
  });

  it("đóng dialog xoá bằng Escape → không gọi API", async () => {
    // Arrange
    fetchExpensesMock.mockResolvedValue({
      expenses: PAGE1,
      meta: { page: 1, pageSize: 20, total: 2 },
    });
    renderHistory();
    await screen.findByText("cơm trưa");

    // Act
    fireEvent.click(screen.getByRole("button", { name: /Xoá khoản cơm trưa/ }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });

    // Assert
    expect(deleteExpenseMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
      user: { id: "u2", name: "Bình", username: "binh99" },
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
