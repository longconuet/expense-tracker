// Entry function cho Vercel (convention: file trong `api/` = serverless function).
// Re-export app Express của packages — không có logic riêng ở đây.
// Route: /api + /api/* (api/index.ts là handler cho cả prefix /api/*).
export { default } from "../apps/api/src/vercel.js";
