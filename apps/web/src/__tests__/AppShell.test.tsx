import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "../core/AppShell";
import { useAuthStore } from "../core/authStore";
import { useSyncStore } from "../core/syncQueue";

const MOCK_USER = { id: "u1", name: "An", username: "an2310" };
const FAMILY_A = {
  id: "fa",
  name: "Nhà An",
  inviteCode: "ABC123",
  ownerName: "An",
  memberCount: 2,
  myRole: "OWNER",
} as const;
const FAMILY_B = {
  id: "fb",
  name: "Công ty X",
  inviteCode: "XYZ789",
  ownerName: "Bình",
  memberCount: 5,
  myRole: "MEMBER",
} as const;

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      {/* Cấu trúc giống router thật: /onboarding là anh em của shell, không nằm trong shell */}
      <Routes>
        <Route path="/onboarding" element={<div>ONBOARDING PAGE</div>} />
        <Route element={<AppShell />}>
          <Route path="/" element={<div>HOME CONTENT</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("core/AppShell", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: MOCK_USER,
      families: [FAMILY_A, FAMILY_B],
      activeFamilyId: FAMILY_A.id,
      status: "authenticated",
    });
    useSyncStore.setState({ pendingCount: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  it("hiện header tên family đang active + bottom nav 5 mục", () => {
    // Arrange + Act
    renderShell();

    // Assert
    expect(screen.getByText("Nhà An")).toBeInTheDocument();
    expect(screen.getByText("Trang chủ")).toBeInTheDocument();
    expect(screen.getByText("Thống kê")).toBeInTheDocument();
    // Nút giữa chỉ có icon + aria-label, không có text
    expect(screen.getByRole("link", { name: "Thêm" })).toBeInTheDocument();
    expect(screen.getByText("Lịch sử")).toBeInTheDocument();
    expect(screen.getByText("Tôi")).toBeInTheDocument();
    expect(screen.getByText("HOME CONTENT")).toBeInTheDocument();
  });

  it("mở switcher → chọn family khác → activeFamilyId đổi", async () => {
    // Arrange + Act
    renderShell();
    fireEvent.click(screen.getByLabelText(/Đổi gia đình/));
    const familyB = await screen.findByText("Công ty X");
    fireEvent.click(familyB.closest("button")!);

    // Assert
    expect(useAuthStore.getState().activeFamilyId).toBe(FAMILY_B.id);
    // Header hiển thị family mới
    expect(screen.getByText("Công ty X")).toBeInTheDocument();
  });

  it("có khoản chờ đồng bộ offline → hiện banner số lượng ở header", () => {
    // Arrange + Act
    useSyncStore.setState({ pendingCount: 2 });
    renderShell();

    // Assert
    expect(screen.getByText("2 khoản chi đang chờ đồng bộ khi có mạng")).toBeInTheDocument();
  });

  it("mất mạng → hiện banner dữ liệu lưu trước ở header", () => {
    // Arrange
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    // Act
    renderShell();

    // Assert
    expect(screen.getByText("Không có mạng — đang xem dữ liệu lưu trước")).toBeInTheDocument();

    // Cleanup — jsdom mặc định onLine = true
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("chưa thuộc family nào → chuyển về onboarding", () => {
    // Arrange
    useAuthStore.setState({ families: [], activeFamilyId: null });

    // Act
    renderShell();

    // Assert
    expect(screen.getByText("ONBOARDING PAGE")).toBeInTheDocument();
  });
});
