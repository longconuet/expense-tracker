import "dotenv/config";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("Thiếu biến môi trường JWT_SECRET (xem .env.example)");
}

export const env = {
  jwtSecret,
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3001),
};
