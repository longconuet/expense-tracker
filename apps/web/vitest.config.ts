import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Chỉ test unit/integration trong src — e2e/ do Playwright chạy riêng (script "e2e")
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
