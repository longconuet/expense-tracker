import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { testDatabaseUrl } from "./dbUrl.js";

// Gọi thẳng node + entry point của prisma CLI — không cần shell shim (cross-platform)
const require = createRequire(import.meta.url);
// "." của package prisma trỏ về file types-only — CLI thật nằm ở build/index.js
const prismaCli = require.resolve("prisma/build/index.js");

// Reset DB test (PostgreSQL expense_tracker_test) trước mỗi lần chạy — state sạch,
// không phụ thuộc dev DB
export default function globalSetup(): void {
  const dbUrl = testDatabaseUrl();
  execFileSync(process.execPath, [prismaCli, "db", "push", "--force-reset", "--skip-generate"], {
    env: { ...process.env, DATABASE_URL: dbUrl, DIRECT_URL: dbUrl },
    stdio: "inherit",
  });
}
