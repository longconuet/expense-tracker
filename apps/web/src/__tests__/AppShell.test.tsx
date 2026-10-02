import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../core/AppShell";
import { useAuthStore } from "../core/authStore";
import { useCacheStatus } from "../core/cacheStatus";
import { useSyncStore } from "../core/syncQueue";

vi.mock("../core/dataApi", () => ({
  materializeRecurring: vi.fn(),
}));

import { materializeRecurring } from "../core/dataApi";

const materializeMock = vi.mocked(materializeRecurring);

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
    useCacheStatus.setState({ servedFromCacheAt: null, markedAt: null });
    materializeMock.mockReset();
    materializeMock.mockResolvedValue({ count: 0, created: [] });
    // jsdom mặc định navigator.onLine = true
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("header không hiện tên family/tài khoản (đã chuyển về tab Tôi) + bottom nav 5 mục", () => {
    // Arrange + Act
    renderShell();

    // Assert — thông tin header cũ không còn
    expect(screen.queryByText("Nhà An")).not.toBeInTheDocument();
    expect(screen.queryByText("an2310")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Đổi gia đình/)).not.toBeInTheDocument();

    // bottom nav 5 mục
    expect(screen.getByText("Trang chủ")).toBeInTheDocument();
    expect(screen.getByText("Thống kê")).toBeInTheDocument();
    // Nút giữa chỉ có icon + aria-label, không có text
    expect(screen.getByRole("link", { name: "Thêm" })).toBeInTheDocument();
    expect(screen.getByText("Lịch sử")).toBeInTheDocument();
    expect(screen.getByText("Tôi")).toBeInTheDocument();
    expect(screen.getByText("HOME CONTENT")).toBeInTheDocument();
  });

  it("không có banner trạng thái → không render header (tiết kiệm diện tích)", () => {
    // Arrange + Act
    renderShell();

    // Assert
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
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

  it("mất mạng + có dữ liệu lưu → banner offline kèm giờ lưu", () => {
    // Arrange
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      useCacheStatus.getState().markServed(new Date().toISOString());

      // Act
      renderShell();

      // Assert
      expect(
        screen.getByText(/Không có mạng — đang xem dữ liệu lưu trước lúc \d{2}:\d{2}/),
      ).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    }
  });

  it("còn mạng nhưng máy chủ không phản hồi (đã dùng bản cache) → banner dữ liệu lưu lúc HH:mm", () => {
    // Arrange
    useCacheStatus.getState().markServed(new Date().toISOString());

    // Act
    renderShell();

    // Assert
    expect(
      screen.getByText(/Máy chủ không phản hồi — đang xem dữ liệu lưu lúc \d{2}:\d{2}/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Không có mạng/)).not.toBeInTheDocument();
  });

  it("đổi trang → xoá banner dữ liệu lưu (màn mới tự hiện lại nếu cũng fallback)", () => {
    // Arrange — mark có sẵn (màn trước đang xem dữ liệu lưu)
    useCacheStatus.getState().markServed(new Date().toISOString());
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Link to="/other">ĐI TRANG KHÁC</Link>} />
            <Route path="/other" element={<div>OTHER PAGE</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Máy chủ không phản hồi/)).toBeInTheDocument();

    // Act — điều hướng sang trang khác
    fireEvent.click(screen.getByRole("link", { name: "ĐI TRANG KHÁC" }));

    // Assert — banner không còn (force clear khi đổi trang)
    expect(screen.getByText("OTHER PAGE")).toBeInTheDocument();
    expect(screen.queryByText(/Máy chủ không phản hồi/)).not.toBeInTheDocument();
  });

  it("chưa thuộc family nào → chuyển về onboarding", () => {
    // Arrange
    useAuthStore.setState({ families: [], activeFamilyId: null });

    // Act
    renderShell();

    // Assert
    expect(screen.getByText("ONBOARDING PAGE")).toBeInTheDocument();
  });

  // case 61 (spec-recurring §5.3): AppShell tự trigger materialize
  it("#61 online + activeFamilyId → gọi materializeRecurring(fid); đổi family → gọi lại với fid mới", async () => {
    // Arrange + Act
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<div>HOME CONTENT</div>} />
            <Route path="/other" element={<div>OTHER PAGE</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    // Assert — gọi đúng 1 lần với family đang active
    expect(materializeMock).toHaveBeenCalledTimes(1);
    expect(materializeMock).toHaveBeenCalledWith(FAMILY_A.id);

    // Act — đổi active family (store) → effect chạy lại
    useAuthStore.setState({ activeFamilyId: FAMILY_B.id });
    await waitFor(() => expect(materializeMock).toHaveBeenCalledTimes(2));

    // Assert
    expect(materializeMock).toHaveBeenLastCalledWith(FAMILY_B.id);
  });

  it("#61 offline → không gọi materializeRecurring", () => {
    // Arrange
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      // Act
      renderShell();

      // Assert
      expect(materializeMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    }
  });

  it("PWA iOS: root + banner có safe-area top (nội dung không chui vào vùng status bar bị iOS blur)", () => {
    // Arrange — bật banner để header render
    useSyncStore.setState({ pendingCount: 1 });

    // Act
    renderShell();

    // Assert — neo class safe-area (env() = 0 trên desktop nên không đổi layout thường)
    expect(screen.getByRole("main").parentElement).toHaveClass("pt-[env(safe-area-inset-top)]");
    expect(screen.getByRole("banner")).toHaveClass("top-[env(safe-area-inset-top)]");
  });
});
