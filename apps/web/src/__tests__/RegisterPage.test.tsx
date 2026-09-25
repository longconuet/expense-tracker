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
import RegisterPage from "../features/auth/RegisterPage";

const apiFetchMock = vi.mocked(apiFetch);

const MOCK_USER = { id: "u1", name: "Nguyễn Văn A", username: "an2310" };

function renderRegisterPage() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/onboarding" element={<div>TRANG ONBOARDING</div>} />
        <Route path="/" element={<div>TRANG CHU</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillForm() {
  fireEvent.change(screen.getByPlaceholderText("Nguyễn Văn A"), {
    target: { value: "Nguyễn Văn A" },
  });
  fireEvent.change(screen.getByPlaceholderText("an2310"), {
    target: { value: "an2310" },
  });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), {
    target: { value: "MatKhau123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
}

describe("Màn đăng ký", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, families: [], activeFamilyId: null, status: "guest" });
    apiFetchMock.mockReset();
  });

  // Vitest không bật globals → RTL không tự cleanup, phải xoá DOM tay
  afterEach(() => {
    cleanup();
  });

  it("submit hợp lệ → gọi API đúng payload (username, không email)", async () => {
    // Arrange
    apiFetchMock.mockImplementation(async (path) => {
      if (path === "/api/auth/register") {
        return { user: MOCK_USER, accessToken: "access-1" };
      }
      if (path === "/api/me") {
        return { user: MOCK_USER, families: [] };
      }
      throw new Error("Unexpected path: " + path);
    });
    renderRegisterPage();

    // Act
    fillForm();

    // Assert
    expect(apiFetchMock).toHaveBeenCalledWith("/api/auth/register", {
      method: "POST",
      body: { name: "Nguyễn Văn A", username: "an2310", password: "MatKhau123" },
      auth: false,
    });
    expect(await screen.findByText("TRANG ONBOARDING")).toBeInTheDocument();
  });

  it("409 trùng username → lỗi ngay dưới ô tên, không chuyển màn", async () => {
    // Arrange
    apiFetchMock.mockRejectedValue(
      new ApiError("USERNAME_TAKEN", "Tên đăng nhập đã được sử dụng", 409),
    );
    renderRegisterPage();

    // Act
    fillForm();

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Tên đăng nhập đã được sử dụng");
    expect(screen.queryByText("TRANG ONBOARDING")).not.toBeInTheDocument();
  });

  it("gõ lại username sau 409 → lỗi dưới ô tự biến mất", async () => {
    // Arrange
    apiFetchMock.mockRejectedValue(
      new ApiError("USERNAME_TAKEN", "Tên đăng nhập đã được sử dụng", 409),
    );
    renderRegisterPage();

    // Act — submit 1 lần cho ra lỗi
    fillForm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Tên đăng nhập đã được sử dụng");

    // Act — gõ lại tên đăng nhập khác
    fireEvent.change(screen.getByPlaceholderText("an2310"), {
      target: { value: "an2311" },
    });

    // Assert — lỗi biến mất, không còn alert nào trên form
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
