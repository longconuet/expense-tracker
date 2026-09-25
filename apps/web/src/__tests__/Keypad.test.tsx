import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Keypad } from "../features/expenses/Keypad";

describe("Keypad (bàn phím số)", () => {
  afterEach(() => {
    cleanup();
  });

  it("render đủ 11 phím: 1-9, xoá, 0 (nằm ngang 2 ô)", () => {
    // Act
    render(<Keypad onKey={vi.fn()} />);

    // Assert
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(11);
    expect(screen.getByRole("button", { name: "Xoá 1 chữ số" })).toBeInTheDocument();
  });

  it("bấm phím số → onKey nhận đúng số; phím xoá → 'back'", () => {
    // Arrange
    const onKey = vi.fn();
    render(<Keypad onKey={onKey} />);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    fireEvent.click(screen.getByRole("button", { name: "Xoá 1 chữ số" }));

    // Assert
    expect(onKey).toHaveBeenNthCalledWith(1, "7");
    expect(onKey).toHaveBeenNthCalledWith(2, "back");
  });

  it("size md → phím cao 56px + chữ/icon/gap nhỏ hơn; mặc định lg → 64px", () => {
    // Arrange + Act — mặc định lg
    const { unmount } = render(<Keypad onKey={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Bàn phím số" })).toHaveClass("gap-2");
    expect(screen.getByRole("button", { name: "7" })).toHaveClass("h-16", "text-2xl");
    unmount();

    render(<Keypad onKey={vi.fn()} size="md" />);

    // Assert
    expect(screen.getByRole("group", { name: "Bàn phím số" })).toHaveClass("gap-1.5");
    expect(screen.getByRole("button", { name: "7" })).toHaveClass("h-14", "text-xl");
    expect(screen.getByRole("button", { name: "Xoá 1 chữ số" }).querySelector("svg")).toHaveClass(
      "h-6",
    );
  });

  it("onClearAll → thêm nút 'Xoá toàn bộ' cạnh phím xoá (12 phím, 0 không còn rộng)", () => {
    // Arrange + Act
    render(<Keypad onKey={vi.fn()} onClearAll={vi.fn()} />);

    // Assert
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(12);
    expect(screen.getByRole("button", { name: "Xoá toàn bộ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0" })).not.toHaveClass("col-span-2");
  });

  it("bấm nút C → gọi onClearAll; không truyền prop → không có nút C", () => {
    // Arrange
    const onClearAll = vi.fn();
    const { unmount } = render(<Keypad onKey={vi.fn()} onClearAll={onClearAll} />);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Xoá toàn bộ" }));

    // Assert
    expect(onClearAll).toHaveBeenCalledTimes(1);
    unmount();

    render(<Keypad onKey={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Xoá toàn bộ" })).not.toBeInTheDocument();
  });

  it("disabled → toàn bộ phím không bấm được", () => {
    // Arrange
    const onKey = vi.fn();
    render(<Keypad onKey={onKey} disabled />);

    // Act
    for (const button of screen.getAllByRole("button")) {
      fireEvent.click(button);
    }

    // Assert
    expect(onKey).not.toHaveBeenCalled();
  });
});
