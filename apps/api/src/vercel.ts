import { createApp } from "./app.js";

/**
 * Entry point cho Vercel serverless function — export thẳng Express app.
 * @vercel/node runtime bọc app thành handler (req, res); KHÔNG gọi .listen().
 * Dev không dùng file này (dev chạy src/index.ts — createApp().listen(port)).
 *
 * Yêu cầu env khi deploy: JWT_SECRET, DATABASE_URL (xem docs/deploy-vercel.md).
 */
export default createApp();
