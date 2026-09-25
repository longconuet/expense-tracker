import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock layer API — store auth chạy thật, chỉ chặn fetch
vi.mock("../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/api")>();
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

import { ApiError, apiFetch } from "../core/api";
import { useAuthStore } from "../core/authStore";
import LoginPage from "../features/auth/LoginPage";

const apiFetchMock = vi.mocked(apiFetch);

const MOCK_USER = { id: "u1", name: "An", username: "an2310" };

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding" element={<div>TRANG ONBOARDING</div>} />
        <Route path="/" element={<div>TRANG CHU</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockLoginSuccess() {
  apiFetchMock.mockImplementation(async (path) => {
    if (path === "/api/auth/login") {
      return { user: MOCK_USER, accessToken: "access-1" };
    }
    if (path === "/api/me") {
      return { user: MOCK_USER, families: [] };
    }
    throw new Error("Unexpected path: " + path);
  });
}

describe("Màn đăng nhập", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, families: [], activeFamilyId: null, status: "guest" });
    apiFetchMock.mockReset();
  });

  // Vitest không bật globals → RTL không tự cleanup, phải xoá DOM tay
  afterEach(() => {
    cleanup();
  });

  it("submit hợp lệ → gọi API đúng payload và chuyển sang onboarding (chưa có family)", async () => {
    // Arrange
    mockLoginSuccess();
    renderLoginPage();

    // Act
    fireEvent.change(screen.getByPlaceholderText("an2310"), {
      target: { value: "an2310" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "MatKhau123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    // Assert
    expect(apiFetchMock).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      body: { username: "an2310", password: "MatKhau123" },
      auth: false,
    });
    // Chưa có family → về onboarding
    expect(await screen.findByText("TRANG ONBOARDING")).toBeInTheDocument();
  });

  it("API trả lỗi sai mật khẩu → hiển thị thông báo lỗi", async () => {
    // Arrange
    apiFetchMock.mockRejectedValue(
      new ApiError("INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng", 401),
    );
    renderLoginPage();

    // Act
    fireEvent.change(screen.getByPlaceholderText("an2310"), {
      target: { value: "an2310" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "sai-mat-khau" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tên đăng nhập hoặc mật khẩu không đúng",
    );
    // Không nhảy màn
    expect(screen.queryByText("TRANG ONBOARDING")).not.toBeInTheDocument();
  });
});
