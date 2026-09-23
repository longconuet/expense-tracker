import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Chỉ test trong src — tránh nạp nhầm file biên dịch (VD dist/) nếu có
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    env: {
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret-khong-dung-san-sanh",
      NODE_ENV: "test",
    },
    globalSetup: ["./test/global-setup.ts"],
  },
});
