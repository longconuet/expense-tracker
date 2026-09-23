import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/** Bật/tắt class `.dark` trên <html> — gọi cả lúc khởi động (trước render). */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light",
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => {
        get().setTheme(get().theme === "light" ? "dark" : "light");
      },
    }),
    { name: "etracker-theme", partialize: (state) => ({ theme: state.theme }) },
  ),
);
