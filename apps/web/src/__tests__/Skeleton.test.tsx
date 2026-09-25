import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "../shared/ui/Skeleton";

describe("Skeleton", () => {
  it("render khối pulse, màu token theme, aria-hidden", () => {
    // Act
    const { container } = render(<Skeleton />);

    // Assert
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass("animate-pulse");
    expect(el).toHaveClass("bg-ink/10");
    expect(el).toHaveAttribute("aria-hidden", "true");
  });

  it("merge className tuỳ chỉnh (kích thước/hình dạng)", () => {
    // Act
    const { container } = render(<Skeleton className="h-10 w-24 rounded-full" />);

    // Assert
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass("h-10");
    expect(el).toHaveClass("w-24");
    expect(el).toHaveClass("rounded-full");
  });
});
