import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme, useThemeStore } from "./core/themeStore";
import "./index.css";

// Áp theme đã lưu TRƯỚC khi render — tránh flash sai theme
applyTheme(useThemeStore.getState().theme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
