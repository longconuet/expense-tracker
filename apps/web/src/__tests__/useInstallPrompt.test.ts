import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstallPrompt } from "../features/me/useInstallPrompt";

const unmounts: Array<() => void> = [];
afterEach(() => {
  for (const unmount of unmounts) unmount();
  unmounts.length = 0;
});

/** jsdom không có beforeinstallprompt thật — dựng event giả đúng shape. */
function makeInstallEvent() {
  return Object.assign(new Event("beforeinstallprompt"), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
  });
}

describe("useInstallPrompt", () => {
  it("mặc định (trình duyệt chưa gửi event): canInstall = false", () => {
    // Arrange + Act
    const { result, unmount } = renderHook(() => useInstallPrompt());
    unmounts.push(unmount);

    // Assert
    expect(result.current.canInstall).toBe(false);
    expect(result.current.installed).toBe(false);
  });

  it("trình duyệt gửi beforeinstallprompt → canInstall = true", () => {
    // Arrange + Act
    const { result, unmount } = renderHook(() => useInstallPrompt());
    unmounts.push(unmount);
    act(() => {
      window.dispatchEvent(makeInstallEvent());
    });

    // Assert
    expect(result.current.canInstall).toBe(true);
  });

  it("bấm cài → gọi prompt() đúng 1 lần, canInstall về false", async () => {
    // Arrange
    const { result, unmount } = renderHook(() => useInstallPrompt());
    unmounts.push(unmount);
    const event = makeInstallEvent();
    act(() => {
      window.dispatchEvent(event);
    });

    // Act
    await act(async () => {
      await result.current.promptInstall();
    });

    // Assert
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.canInstall).toBe(false);
  });

  it("appinstalled → installed = true, ẩn nút cài", () => {
    // Arrange + Act
    const { result, unmount } = renderHook(() => useInstallPrompt());
    unmounts.push(unmount);
    act(() => {
      window.dispatchEvent(makeInstallEvent());
    });
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    // Assert
    expect(result.current.installed).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });
});
