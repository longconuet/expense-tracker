import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";

function fakeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("App — phiên đăng nhập (không còn refresh cookie)", () => {
  it("không khôi phục được phiên → hiện trang đăng nhập", async () => {
    // Arrange: gọi refresh fail (cookie không còn)
    const fetchMock = vi.fn().mockResolvedValueOnce(
      fakeResponse(
        { success: false, data: null, error: { code: "UNAUTHORIZED", message: "Thiếu refresh token" } },
        401,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    // Act
    render(<App />);

    // Assert: guard chuyển về /login, chỉ gọi refresh (không gọi /me)
    expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/refresh", expect.objectContaining({ method: "POST" }));
  });
});
