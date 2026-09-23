# Chi Tiêu Gia Đình (Expense Tracker)

Web app (PWA) quản lý chi tiêu cho gia đình — mobile-first, nhập liệu nhanh, giao diện tối giản.

> Kế hoạch chi tiết đã duyệt: [`docs/plan.md`](docs/plan.md) · Trạng thái công việc: [`docs/handoff/progress.md`](docs/handoff/progress.md)

## Tech stack

| Tầng | Công nghệ |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 + Zustand + Recharts |
| PWA | vite-plugin-pwa (cài lên màn hình chính, offline queue) |
| Backend | Node.js + Express + TypeScript |
| ORM / DB | Prisma — SQLite (dev), PostgreSQL (prod) |
| Monorepo | pnpm workspaces |

## Cấu trúc thư mục

```
expense-tracker/
├─ apps/
│  ├─ api/        # REST API (Express + Prisma)
│  └─ web/        # PWA React (mobile-first)
├─ packages/
│  └─ shared/     # Type + utility dùng chung (envelope API, formatVnd, preset category)
├─ docs/
│  ├─ plan.md     # Kế hoạch đã duyệt (stack, data model, API, UX, WBS)
│  └─ handoff/    # Chạy tiếp trạng thái công việc giữa các session
└─ tsconfig.base.json
```

## Chạy local

Yêu cầu: Node.js 20+, pnpm 12+.

```bash
pnpm install
pnpm dev
```

- Web: http://localhost:5173 (đã proxy `/api` → `http://localhost:3001`)
- API: http://localhost:3001/api/health

## Scripts (root)

| Lệnh | Mô tả |
|---|---|
| `pnpm dev` | Chạy API + Web song song (dev) |
| `pnpm build` | Build tất cả packages |
| `pnpm test` | Chạy unit/integration test tất cả packages |
| `pnpm lint` | ESLint toàn repo |
| `pnpm format` | Prettier toàn repo |

## Quy ước

- Mọi response API trả về envelope `{ success, data, error, meta }` (meta cho phân trang).
- Tiền: số nguyên VND, hiển thị `1.234.567 ₫` (dùng `formatVnd` từ `@expense-tracker/shared`).
- Commit: Conventional Commits, commit thẳng nhánh `develop`.
- Test: Vitest, pattern AAA, coverage tối thiểu 80%.
