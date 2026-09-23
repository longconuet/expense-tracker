import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

// Gọi thẳng node + entry point của prisma CLI — không cần shell shim (cross-platform)
const require = createRequire(import.meta.url);
// "." của package prisma trỏ về file types-only — CLI thật nằm ở build/index.js
const prismaCli = require.resolve("prisma/build/index.js");

// Reset DB test (prisma/test.db) trước mỗi lần chạy test — state sạch, không phụ thuộc dev.db
export default function globalSetup(): void {
  execFileSync(process.execPath, [prismaCli, "db", "push", "--force-reset", "--skip-generate"], {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}
