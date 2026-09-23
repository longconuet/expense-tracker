# Web — Vite build (kèm PWA service worker/manifest) → nginx serve
# Context build: ROOT THƯ MỤC REPO (chạy từ docker/, xem docker-compose.yml).
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @expense-tracker/web build

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
