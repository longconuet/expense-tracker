import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MODAL_EXIT_MS,
  useDismissTransition,
} from "../shared/ui/useDismissTransition";

function setup(initial: boolean) {
  return renderHook(
    ({ open }: { open: boolean }) => useDismissTransition(open, MODAL_EXIT_MS),
    { initialProps: { open: initial } },
  );
}

describe("shared/ui/useDismissTransition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("open=true → mounted, không closing (pha mở)", () => {
    // Act
    const { result } = setup(true);

    // Assert
    expect(result.current).toEqual({ mounted: true, closing: false });
  });

  it("open=false ngay từ đầu → không mounted, không chạy exit", () => {
    // Act
    const { result } = setup(false);
    act(() => {
      vi.advanceTimersByTime(MODAL_EXIT_MS * 2);
    });

    // Assert
    expect(result.current).toEqual({ mounted: false, closing: false });
  });

  it("open → false: closing=true trong exitMs, rồi unmount", () => {
    // Arrange + Act
    const { result, rerender } = setup(true);
    rerender({ open: false });

    // Assert — bắt đầu pha exit
    expect(result.current).toEqual({ mounted: true, closing: true });

    // Assert — chưa tới hạn thì vẫn mounted
    act(() => {
      vi.advanceTimersByTime(MODAL_EXIT_MS - 10);
    });
    expect(result.current).toEqual({ mounted: true, closing: true });

    // Assert — tới hạn → unmount
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(result.current).toEqual({ mounted: false, closing: false });
  });

  it("unmount giữa pha đóng → huỷ timer, không update state sau unmount", () => {
    // Arrange + Act — vào pha exit rồi unmount (VD điều hướng route)
    const { result, rerender, unmount } = setup(true);
    rerender({ open: false });
    expect(result.current.closing).toBe(true);
    unmount();

    // Act — chạy timer vượt thời lượng (nếu timer chưa được cleanup sẽ fire)
    act(() => {
      vi.advanceTimersByTime(MODAL_EXIT_MS * 2);
    });

    // Assert — không lỗi, state giữ nguyên giá trị cuối (không có update "chết")
    expect(result.current).toEqual({ mounted: true, closing: true });
  });

  it("full cycle: mở → đóng → mở → đóng", () => {
    // Arrange
    const { result, rerender } = setup(true);
    expect(result.current).toEqual({ mounted: true, closing: false });

    // Act — đóng + chờ xong exit
    rerender({ open: false });
    expect(result.current).toEqual({ mounted: true, closing: true });
    act(() => {
      vi.advanceTimersByTime(MODAL_EXIT_MS);
    });
    expect(result.current).toEqual({ mounted: false, closing: false });

    // Act — mở lại
    rerender({ open: true });
    expect(result.current).toEqual({ mounted: true, closing: false });

    // Act — đóng lần hai + chờ xong exit
    rerender({ open: false });
    act(() => {
      vi.advanceTimersByTime(MODAL_EXIT_MS);
    });

    // Assert
    expect(result.current).toEqual({ mounted: false, closing: false });
  });

  it("mở lại trong lúc đang đóng → huỷ timer, về pha enter", () => {
    // Arrange + Act — đóng rồi mở lại trước khi hết thời lượng
    const { result, rerender } = setup(true);
    rerender({ open: false });
    expect(result.current.closing).toBe(true);
    act(() => {
      vi.advanceTimersByTime(MODAL_EXIT_MS / 2);
    });
    rerender({ open: true });

    // Assert — về pha enter
    expect(result.current).toEqual({ mounted: true, closing: false });

    // Assert — timer đóng cũ đã huỷ: chạy vượt thời lượng cũng không unmount
    act(() => {
      vi.advanceTimersByTime(MODAL_EXIT_MS * 2);
    });
    expect(result.current).toEqual({ mounted: true, closing: false });
  });
});
