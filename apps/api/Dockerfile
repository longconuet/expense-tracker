# API — Express + Prisma (SQLite hoặc PostgreSQL qua DATABASE_URL)
# Context build: ROOT THƯ MỤC REPO (chạy từ docker/, xem docker-compose.yml).
# Server chạy qua tsx (esbuild compile in-memory) cho apps/api.
# packages/shared được build sang dist (JS + d.ts) — runtime Node không chạy file .ts.
FROM node:24-alpine
RUN corepack enable
WORKDIR /app

# Cài workspace đầy đủ (api phụ thuộc @expense-tracker/shared)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile

# Build shared sang dist (JS) — api import runtime qua dist/index.js
RUN pnpm --filter @expense-tracker/shared build

# Sinh Prisma Client + engine cho đúng platform container (linux-musl)
RUN pnpm --filter @expense-tracker/api exec prisma generate

ENV NODE_ENV=production
EXPOSE 3001

# Apply migration rồi khởi động server
CMD ["sh", "-c", "cd apps/api && ./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/tsx src/index.ts"]
