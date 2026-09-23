/**
 * URL database cho unit/integration test (PostgreSQL — Phase 1, thay test.db SQLite).
 * - Local dev: DB `expense_tracker_test` do `docker-compose.dev.yml` + `dev-db.init.sql`
 *   tạo sẵn (bắt buộc container đang chạy: `docker compose -f docker-compose.dev.yml up -d`).
 * - CI (GitHub Actions): override bằng env `TEST_DATABASE_URL` trỏ sang service postgres:16.
 */
export const DEFAULT_TEST_DATABASE_URL =
  "postgresql://etracker:etracker@localhost:5432/expense_tracker_test";

export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
}
