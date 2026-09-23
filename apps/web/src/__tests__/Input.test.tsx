import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Input } from "../shared/ui/Input";

describe("shared/ui/Input", () => {
  afterEach(() => {
    cleanup();
  });

  it("label gắn với input, pass-through props chuẩn form", () => {
    // Arrange + Act
    render(<Input label="Email" type="email" placeholder="ban@gmail.com" required />);
    const input = screen.getByLabelText("Email");

    // Assert
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("placeholder", "ban@gmail.com");
    expect(input).toBeRequired();
  });

  it("có lỗi → hiển thị với role alert", () => {
    // Arrange + Act
    render(<Input label="Email" error="Email không hợp lệ" />);

    // Assert
    expect(screen.getByRole("alert")).toHaveTextContent("Email không hợp lệ");
  });

  it("không lỗi → không render alert, có hint thì hiện hint", () => {
    // Arrange + Act
    render(<Input label="Mật khẩu" error={null} hint="Tối thiểu 8 ký tự." />);

    // Assert
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Tối thiểu 8 ký tự.")).toBeInTheDocument();
  });
});
