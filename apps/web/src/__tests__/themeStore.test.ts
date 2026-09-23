import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, useThemeStore } from "../core/themeStore";

describe("core/themeStore", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    useThemeStore.setState({ theme: "light" });
  });

  it("mặc định light, <html> không có class dark", () => {
    // Act
    const { theme } = useThemeStore.getState();

    // Assert
    expect(theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggleTheme → dark: thêm class .dark lên <html>", () => {
    // Act
    useThemeStore.getState().toggleTheme();

    // Assert
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggleTheme → về lại light: gỡ class .dark", () => {
    // Arrange
    useThemeStore.getState().setTheme("dark");

    // Act
    useThemeStore.getState().toggleTheme();

    // Assert
    expect(useThemeStore.getState().theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("applyTheme áp/gỡ class .dark độc lập với store", () => {
    // Act + Assert
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
