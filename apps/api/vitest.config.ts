import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret-khong-dung-san-sanh",
      NODE_ENV: "test",
    },
    globalSetup: ["./test/global-setup.ts"],
  },
});
