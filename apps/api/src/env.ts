import "dotenv/config";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("Thiếu biến môi trường JWT_SECRET (xem .env.example)");
}

const exportMaxRows = Number(process.env.EXPORT_MAX_ROWS ?? 5000);
if (!Number.isInteger(exportMaxRows) || exportMaxRows < 1) {
  throw new Error("EXPORT_MAX_ROWS phải là số nguyên ≥ 1 (xem .env.example)");
}
// Trần cho cap: config sai (VD 1.000.000) không thể khiến response export
// phình vượt limit response Vercel / memory serverless
const EXPORT_MAX_ROWS_CEILING = 20000;

export const env = {
  jwtSecret,
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3001),
  /** Số dòng tối đa khi export lịch sử chi tiêu (xlsx/csv). */
  exportMaxRows: Math.min(exportMaxRows, EXPORT_MAX_ROWS_CEILING),
};
