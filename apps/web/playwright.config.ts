import { defineConfig } from "@playwright/test";

/**
 * E2E (WBS 13) — Playwright trên Chromium thật, môi trường tách biệt:
 * - API :3101, PostgreSQL `expense_tracker_e2e` (Postgres local —
 *   `docker compose -f docker-compose.dev.yml up -d`; `db push --force-reset`
 *   trước mỗi lần chạy — không đụng dev DB :3001)
 * - Web: vite dev :5199 (strictPort) proxy /api → :3101
 *   (qua `VITE_API_PROXY_TARGET` — xem vite.config.ts)
 */

// DB e2e trên Postgres local; CI có thể override bằng env E2E_DATABASE_URL
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://etracker:etracker@localhost:5432/expense_tracker_e2e";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // 1 DB e2e dùng chung — chạy tuần tự, không race giữa các test
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5199",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command:
        "pnpm --filter @expense-tracker/api exec prisma db push --force-reset --skip-generate && pnpm --filter @expense-tracker/api dev",
      url: "http://localhost:3101/api/health",
      env: {
        PORT: "3101",
        DATABASE_URL: E2E_DATABASE_URL,
        DIRECT_URL: E2E_DATABASE_URL,
        JWT_SECRET: "e2e-secret-cu-cho-playwright-0123456789abcdef",
      },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @expense-tracker/web exec vite --port 5199 --strictPort",
      url: "http://localhost:5199",
      env: { VITE_API_PROXY_TARGET: "http://localhost:3101" },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
