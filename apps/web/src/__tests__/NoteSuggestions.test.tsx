import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteSuggestions } from "../features/expenses/NoteSuggestions";

describe("NoteSuggestions (chip gợi ý ghi chú)", () => {
  afterEach(() => {
    cleanup();
  });

  it("suggestions rỗng → render nothing (không chiếm chỗ)", () => {
    // Arrange + Act
    const { container } = render(<NoteSuggestions suggestions={[]} onSelect={() => {}} />);

    // Assert
    expect(container.firstChild).toBeNull();
  });

  it("hiện 1 chip cho mỗi gợi ý, trong group 'Gợi ý ghi chú'", () => {
    // Arrange + Act
    render(<NoteSuggestions suggestions={["Đổ xăng", "Đặt xe"]} onSelect={() => {}} />);

    // Assert
    expect(screen.getByRole("group", { name: "Gợi ý ghi chú" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gợi ý ghi chú Đổ xăng" })).toHaveTextContent("Đổ xăng");
    expect(screen.getByRole("button", { name: "Gợi ý ghi chú Đặt xe" })).toHaveTextContent("Đặt xe");
  });

  it("chạm chip → onSelect nhận đúng text, gọi đúng 1 lần", () => {
    // Arrange
    const onSelect = vi.fn();
    render(<NoteSuggestions suggestions={["Đổ xăng"]} onSelect={onSelect} />);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý ghi chú Đổ xăng" }));

    // Assert
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("Đổ xăng");
  });

  it("disabled (đang submit) → chip disabled, không fire onSelect", () => {
    // Arrange
    const onSelect = vi.fn();
    render(<NoteSuggestions suggestions={["Đổ xăng"]} onSelect={onSelect} disabled />);
    const chip = screen.getByRole("button", { name: "Gợi ý ghi chú Đổ xăng" });

    // Act
    fireEvent.click(chip);

    // Assert
    expect(chip).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
