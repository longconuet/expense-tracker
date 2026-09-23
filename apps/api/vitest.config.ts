import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./test/dbUrl.js";

export default defineConfig({
  test: {
    environment: "node",
    // Chỉ test trong src — tránh nạp nhầm file biên dịch (VD dist/) nếu có
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    env: {
      // PostgreSQL local (xem test/dbUrl.ts) — CI override bằng TEST_DATABASE_URL
      DATABASE_URL: testDatabaseUrl(),
      DIRECT_URL: testDatabaseUrl(),
      JWT_SECRET: "test-secret-khong-dung-san-sanh",
      NODE_ENV: "test",
    },
    globalSetup: ["./test/global-setup.ts"],
  },
});
