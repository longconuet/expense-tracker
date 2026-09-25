import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, getAccessToken, setAccessToken, setSessionExpiredHandler } from "../core/api";

/** Response giả tối giản đủ cho api client đọc (status/ok/json). */
function fakeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const envelope = (data: unknown) => ({ success: true, data, error: null });
const errorEnvelope = (code: string, message: string) => ({
  success: false,
  data: null,
  error: { code, message },
});

describe("core/api", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken(null);
  });

  it("trả về data khi API success", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ hello: "world" })));

    // Act
    const data = await apiFetch<{ hello: string }>("/api/me");

    // Assert
    expect(data).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/me");
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("gắn header Authorization khi đã có access token", async () => {
    // Arrange
    setAccessToken("token-1");
    fetchMock.mockResolvedValueOnce(fakeResponse(envelope({ ok: true })));

    // Act
    await apiFetch("/api/me");

    // Assert
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer token-1");
  });

  it("ném ApiError kèm code + message + status khi API lỗi", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(
      fakeResponse(errorEnvelope("BAD_REQUEST", "Tên phải từ 2 ký tự"), 400),
    );

    // Act + Assert
    await expect(apiFetch("/api/families", { method: "POST", body: { name: "A" } })).rejects.toMatchObject({
      name: "ApiError",
      code: "BAD_REQUEST",
      message: "Tên phải từ 2 ký tự",
      status: 400,
    });
  });

  it("401 → gọi refresh → retry 1 lần với token mới", async () => {
    // Arrange: 1) request gốc 401, 2) refresh OK, 3) retry 200
    setAccessToken("token-cu");
    fetchMock
      .mockResolvedValueOnce(fakeResponse(errorEnvelope("UNAUTHORIZED", "Hết hạn"), 401))
      .mockResolvedValueOnce(fakeResponse(envelope({ user: {}, accessToken: "token-moi" })))
      .mockResolvedValueOnce(fakeResponse(envelope({ hello: "ok" })));

    // Act
    const data = await apiFetch<{ hello: string }>("/api/me");

    // Assert
    expect(data).toEqual({ hello: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/me");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/refresh");
    expect(fetchMock.mock.calls[2][0]).toBe("/api/me");
    // Retry phải dùng token mới
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer token-moi");
    expect(getAccessToken()).toBe("token-moi");
  });

  it("refresh fail → xoá token, gọi onSessionExpired, ném ApiError 401 gốc", async () => {
    // Arrange
    setAccessToken("token-cu");
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock
      .mockResolvedValueOnce(fakeResponse(errorEnvelope("UNAUTHORIZED", "Hết hạn"), 401))
      .mockResolvedValueOnce(fakeResponse(errorEnvelope("UNAUTHORIZED", "Thiếu refresh token"), 401));

    // Act + Assert
    await expect(apiFetch("/api/me")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it("401 ở request auth: false (VD login sai) → không refresh, ném luôn", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(
      fakeResponse(errorEnvelope("INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng"), 401),
    );

    // Act + Assert
    await expect(
      apiFetch("/api/auth/login", {
        method: "POST",
        body: { username: "ab", password: "x" },
        auth: false,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // không có request refresh
  });

  it("lỗi mạng → ApiError NETWORK_ERROR (status 0)", async () => {
    // Arrange
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    // Act + Assert
    await expect(apiFetch("/api/me")).rejects.toMatchObject({
      name: "ApiError",
      code: "NETWORK_ERROR",
      status: 0,
    });
  });
});
