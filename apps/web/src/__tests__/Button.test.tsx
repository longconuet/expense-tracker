import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../shared/ui/Button";

describe("shared/ui/Button", () => {
  afterEach(() => {
    cleanup();
  });

  it("render chữ nút và gọi onClick khi bấm", () => {
    // Arrange
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Lưu</Button>);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("loading → nút disable và không gọi onClick", () => {
    // Arrange
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Lưu
      </Button>,
    );
    const button = screen.getByRole("button");

    // Act
    fireEvent.click(button);

    // Assert
    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("variant + size thay lớp class tương ứng", () => {
    // Arrange + Act
    render(
      <Button variant="danger" size="lg">
        Xoá
      </Button>,
    );

    // Assert
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-danger");
    expect(button.className).toContain("py-3");
  });

  it("disabled → không gọi onClick", () => {
    // Arrange
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Lưu
      </Button>,
    );

    // Act
    fireEvent.click(screen.getByRole("button"));

    // Assert
    expect(onClick).not.toHaveBeenCalled();
  });
});
