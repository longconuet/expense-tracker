import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/swUpdate", () => ({
  hasPendingUpdate: vi.fn(() => false),
  requestSwUpdateCheck: vi.fn(async () => undefined),
  applySwUpdate: vi.fn(async () => undefined),
}));

import { applySwUpdate, hasPendingUpdate, requestSwUpdateCheck } from "../core/swUpdate";
import { useSwUpdate } from "../features/me/useSwUpdate";

const hasPendingMock = vi.mocked(hasPendingUpdate);
const requestCheckMock = vi.mocked(requestSwUpdateCheck);
const applyMock = vi.mocked(applySwUpdate);

function makeSwMock() {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    controller: null,
    addEventListener: vi.fn((type: string, cb: () => void) => {
      (listeners[type] ??= []).push(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== cb);
    }),
    _emit: (type: string) => (listeners[type] ?? []).slice().forEach((cb) => cb()),
  };
}

describe("useSwUpdate (trạng thái cập nhật PWA cho màn Tôi)", () => {
  let sw: ReturnType<typeof makeSwMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    hasPendingMock.mockReturnValue(false);
    sw = makeSwMock();
    Object.defineProperty(navigator, "serviceWorker", {
      value: sw,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
  });

  it("màn mở → tự kiểm tra chủ động đúng 1 lần; chưa có bản mới → updateAvailable false", async () => {
    // Arrange + Act
    const { result } = renderHook(() => useSwUpdate());
    await act(async () => {});

    // Assert
    expect(requestCheckMock).toHaveBeenCalledTimes(1);
    expect(result.current.updateAvailable).toBe(false);
  });

  it("đang có SW mới điều khiển trang → updateAvailable true ngay khi màn mở", async () => {
    // Arrange
    hasPendingMock.mockReturnValue(true);

    // Act
    const { result } = renderHook(() => useSwUpdate());
    await act(async () => {});

    // Assert
    expect(result.current.updateAvailable).toBe(true);
  });

  it("SW mới claim khi đang mở màn (controllerchange) → updateAvailable đổi sang true", async () => {
    // Arrange
    const { result } = renderHook(() => useSwUpdate());
    await act(async () => {});
    expect(result.current.updateAvailable).toBe(false);

    // Act — SW mới activate + clientsClaim
    hasPendingMock.mockReturnValue(true);
    act(() => {
      sw._emit("controllerchange");
    });

    // Assert
    expect(result.current.updateAvailable).toBe(true);
  });

  it("bấm applyUpdate → gọi applySwUpdate; xong → applying về false", async () => {
    // Arrange
    hasPendingMock.mockReturnValue(true);
    const { result } = renderHook(() => useSwUpdate());
    await act(async () => {});

    // Act
    await act(async () => {
      await result.current.applyUpdate();
    });

    // Assert
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(result.current.applying).toBe(false);
  });

  it("unmount → gỡ listener controllerchange", () => {
    // Arrange + Act
    const { unmount } = renderHook(() => useSwUpdate());
    expect(sw.addEventListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));

    unmount();

    // Assert
    expect(sw.removeEventListener).toHaveBeenCalledWith(
      "controllerchange",
      expect.any(Function),
    );
  });

  it("trình duyệt không hỗ trợ SW → không kiểm tra, updateAvailable false", async () => {
    // Arrange — XÓA property (không đặt undefined: `"serviceWorker" in navigator`
    // vẫn true nếu property tồn tại)
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;

    // Act
    const { result } = renderHook(() => useSwUpdate());
    await act(async () => {});

    // Assert
    expect(requestCheckMock).not.toHaveBeenCalled();
    expect(result.current.updateAvailable).toBe(false);
  });
});
