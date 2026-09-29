import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/swUpdate", () => ({
  hasPendingUpdate: vi.fn(() => false),
  requestSwUpdateCheck: vi.fn(async () => undefined),
  applySwUpdate: vi.fn(async () => undefined),
}));

import { applySwUpdate, hasPendingUpdate } from "../core/swUpdate";
import { ApiError } from "../core/api";
import { useAuthStore } from "../core/authStore";
import { useThemeStore } from "../core/themeStore";
import MePage from "../features/me/MePage";

const hasPendingUpdateMock = vi.mocked(hasPendingUpdate);
const applySwUpdateMock = vi.mocked(applySwUpdate);

const USER = { id: "u1", name: "An", username: "an2310" };
const FAMILY = {
  id: "f1",
  name: "Nhà An",
  inviteCode: "ABC123",
  ownerName: "An",
  memberCount: 2,
  myRole: "OWNER",
} as const;
const FAMILY_NEW = {
  id: "f2",
  name: "Nhà Mới",
  inviteCode: "NEW123",
  ownerName: "An",
  memberCount: 1,
  myRole: "OWNER",
} as const;

function renderMe() {
  return render(
    <MemoryRouter initialEntries={["/me"]}>
      <Routes>
        <Route path="/me" element={<MePage />} />
        <Route path="/" element={<div>HOME MARKER</div>} />
        <Route path="/login" element={<div>LOGIN MARKER</div>} />
        <Route path="/categories" element={<div>CATEGORIES MARKER</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Màn Tôi", () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    useThemeStore.setState({ theme: "light" });
    useAuthStore.setState({
      user: USER,
      families: [FAMILY],
      activeFamilyId: FAMILY.id,
      status: "authenticated",
      logout: vi.fn(async () => undefined),
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    });
    // Hook useSwUpdate cần serviceWorker để đăng ký listener + kiểm tra
    hasPendingUpdateMock.mockReturnValue(false);
    applySwUpdateMock.mockReset();
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        controller: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    writeTextMock.mockClear();
  });

  it("hiện thông tin user + family + mã mời", () => {
    // Arrange + Act
    renderMe();

    // Assert
    expect(screen.getByText("An")).toBeInTheDocument();
    expect(screen.getByText("an2310")).toBeInTheDocument();
    expect(screen.getByText("Nhà An")).toBeInTheDocument();
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(screen.getByText("Chủ gia đình")).toBeInTheDocument();
  });

  it("bấm card family → mở dialog đổi gia đình; chọn family khác → setActiveFamily + đóng dialog", () => {
    // Arrange — user thuộc 2 family (đổi family giờ chỉ ở tab Tôi, không còn ở header)
    const FAMILY_2 = {
      id: "f2",
      name: "Công ty X",
      inviteCode: "XYZ789",
      ownerName: "Bình",
      memberCount: 5,
      myRole: "MEMBER",
    } as const;
    useAuthStore.setState({ families: [FAMILY, FAMILY_2] });
    renderMe();

    // Act — mở switcher từ card family rồi chọn family khác
    fireEvent.click(screen.getByRole("button", { name: /Đổi gia đình/ }));
    expect(screen.getByRole("dialog", { name: "Đổi gia đình" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Công ty X").closest("button")!);

    // Assert — active family đổi, dialog đóng, card trỏ về family mới
    expect(useAuthStore.getState().activeFamilyId).toBe(FAMILY_2.id);
    expect(screen.queryByRole("dialog", { name: "Đổi gia đình" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Đổi gia đình \(đang ở Công ty X/ }),
    ).toBeInTheDocument();
  });

  it("không có bản cập nhật mới → không hiện nút 'Cập nhật ngay'", async () => {
    // Arrange + Act (hasPendingUpdate mặc định false)
    renderMe();
    await act(async () => {});

    // Assert
    expect(screen.queryByRole("button", { name: "Cập nhật ngay" })).not.toBeInTheDocument();
    expect(screen.queryByText("Có bản cập nhật mới")).not.toBeInTheDocument();
  });

  it("có bản cập nhật mới → hiện nút 'Cập nhật ngay'; bấm → gọi applySwUpdate", async () => {
    // Arrange
    hasPendingUpdateMock.mockReturnValue(true);

    // Act
    renderMe();
    const updateBtn = await screen.findByRole("button", { name: "Cập nhật ngay" });
    fireEvent.click(updateBtn);
    await act(async () => {});

    // Assert
    expect(screen.getByText("Có bản cập nhật mới")).toBeInTheDocument();
    expect(applySwUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("bật/tắt giao diện tối → theme store đổi + class .dark trên <html>", () => {
    // Arrange + Act
    renderMe();
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    // Assert
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Đang bật")).toBeInTheDocument();

    // Bật lại về light
    fireEvent.click(screen.getByRole("switch"));
    expect(useThemeStore.getState().theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("bấm Copy mã mời → ghi inviteCode vào clipboard, không mở modal", async () => {
    // Arrange + Act
    renderMe();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    // Assert
    expect(await screen.findByText("Đã copy")).toBeInTheDocument();
    expect(writeTextMock).toHaveBeenCalledWith("ABC123");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clipboard fail → không hiện 'Đã copy', không mở prompt (mã hiển thị sẵn trong card)", async () => {
    // Arrange
    renderMe();
    const promptSpy = vi.fn();
    vi.stubGlobal("prompt", promptSpy);
    writeTextMock.mockRejectedValueOnce(new Error("denied"));

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await act(async () => {});

    // Assert
    expect(screen.queryByText("Đã copy")).not.toBeInTheDocument();
    expect(promptSpy).not.toHaveBeenCalled();
    expect(screen.getByText("ABC123")).toBeInTheDocument();
  });

  it("đăng xuất qua dialog xác nhận → gọi logout + chuyển về /login", async () => {
    // Arrange
    const logoutMock = vi.fn(async () => undefined);
    useAuthStore.setState({ logout: logoutMock });
    renderMe();

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Đăng xuất" }));

    // Assert
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("LOGIN MARKER")).toBeInTheDocument();
  });

  it("hiện nút cài ứng dụng khi trình duyệt gửi beforeinstallprompt", async () => {
    // Arrange + Act
    renderMe();
    fireEvent(
      window,
      Object.assign(new Event("beforeinstallprompt"), {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
      }),
    );

    // Assert
    expect(await screen.findByRole("button", { name: /Cài ứng dụng/ })).toBeInTheDocument();
  });

  it("huy xác nhận đăng xuất trong dialog → không gọi logout", async () => {
    // Arrange
    const logoutMock = vi.fn(async () => undefined);
    useAuthStore.setState({ logout: logoutMock });
    renderMe();

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Huỷ" }));

    // Assert
    expect(logoutMock).not.toHaveBeenCalled();
    expect(screen.queryByText("LOGIN MARKER")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hàng 'Danh mục chi tiêu' → điều hướng /categories", async () => {
    // Arrange + Act
    renderMe();
    fireEvent.click(screen.getByRole("button", { name: "Danh mục chi tiêu" }));

    // Assert
    expect(await screen.findByText("CATEGORIES MARKER")).toBeInTheDocument();
  });

  describe("tạo/join family thêm từ dialog", () => {
    it("mở switcher → hiện cả 2 nút action", () => {
      // Arrange + Act
      renderMe();
      fireEvent.click(screen.getByRole("button", { name: /Đổi gia đình/ }));

      // Assert
      expect(screen.getByRole("button", { name: /Tạo gia đình mới/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Join bằng mã mời/ })).toBeInTheDocument();
    });

    it("luồng create full: nhập tên → submit → createFamily được gọi, dialog đóng, về /", async () => {
      // Arrange
      const createFamilyMock = vi.fn(async () => FAMILY_NEW);
      useAuthStore.setState({ createFamily: createFamilyMock });
      renderMe();
      fireEvent.click(screen.getByRole("button", { name: /Đổi gia đình/ }));
      fireEvent.click(screen.getByRole("button", { name: /Tạo gia đình mới/ }));
      fireEvent.change(screen.getByLabelText("Tên gia đình"), { target: { value: "  Nhà Mới  " } });

      // Act
      fireEvent.click(screen.getByRole("button", { name: "Tạo gia đình" }));

      // Assert
      expect(await screen.findByText("HOME MARKER")).toBeInTheDocument();
      expect(createFamilyMock).toHaveBeenCalledTimes(1);
      expect(createFamilyMock).toHaveBeenCalledWith("Nhà Mới");
      expect(screen.queryByRole("dialog", { name: "Đổi gia đình" })).not.toBeInTheDocument();
    });

    it("luồng join full: nhập mã → submit → joinFamily được gọi, dialog đóng, về /", async () => {
      // Arrange
      const joinFamilyMock = vi.fn(async () => FAMILY_NEW);
      useAuthStore.setState({ joinFamily: joinFamilyMock });
      renderMe();
      fireEvent.click(screen.getByRole("button", { name: /Đổi gia đình/ }));
      fireEvent.click(screen.getByRole("button", { name: /Join bằng mã mời/ }));
      fireEvent.change(screen.getByLabelText("Mã mời"), { target: { value: "abc234" } });

      // Act
      fireEvent.click(screen.getByRole("button", { name: "Tham gia" }));

      // Assert
      expect(await screen.findByText("HOME MARKER")).toBeInTheDocument();
      expect(joinFamilyMock).toHaveBeenCalledTimes(1);
      expect(joinFamilyMock).toHaveBeenCalledWith("ABC234");
      expect(screen.queryByRole("dialog", { name: "Đổi gia đình" })).not.toBeInTheDocument();
    });

    it("store action reject → dialog vẫn mở + hiện lỗi trong form", async () => {
      // Arrange
      const joinFamilyMock = vi.fn(async () => {
        throw new ApiError("ALREADY_MEMBER", "Bạn đã là thành viên gia đình này.", 409);
      });
      useAuthStore.setState({ joinFamily: joinFamilyMock });
      renderMe();
      fireEvent.click(screen.getByRole("button", { name: /Đổi gia đình/ }));
      fireEvent.click(screen.getByRole("button", { name: /Join bằng mã mời/ }));
      fireEvent.change(screen.getByLabelText("Mã mời"), { target: { value: "ABC234" } });

      // Act
      fireEvent.click(screen.getByRole("button", { name: "Tham gia" }));

      // Assert — dialog vẫn mở (aria-label theo view khi ở form join), lỗi hiển thị, không navigate
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Bạn đã là thành viên gia đình này.",
      );
      expect(screen.getByRole("dialog", { name: "Join bằng mã mời" })).toBeInTheDocument();
      expect(screen.queryByText("HOME MARKER")).not.toBeInTheDocument();
    });
  });
});
