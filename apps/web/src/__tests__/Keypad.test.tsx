import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Keypad } from "../features/expenses/Keypad";

describe("Keypad (bàn phím số to)", () => {
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
