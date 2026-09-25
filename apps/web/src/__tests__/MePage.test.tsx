import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/swUpdate", () => ({
  hasPendingUpdate: vi.fn(() => false),
  requestSwUpdateCheck: vi.fn(async () => undefined),
  applySwUpdate: vi.fn(async () => undefined),
}));

import { applySwUpdate, hasPendingUpdate } from "../core/swUpdate";
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

function renderMe() {
  return render(
    <MemoryRouter initialEntries={["/me"]}>
      <Routes>
        <Route path="/me" element={<MePage />} />
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
});
