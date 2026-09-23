import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { errorHandler, notFoundHandler, sendOk } from "./lib/apiError.js";
import { authRouter } from "./routes/auth.routes.js";
import { categoryRouter } from "./routes/category.routes.js";
import { familyRouter } from "./routes/family.routes.js";
import { expenseFamilyRouter, expenseRouter } from "./routes/expense.routes.js";
import { meRouter } from "./routes/me.routes.js";
import { statsRouter } from "./routes/stats.routes.js";

export function createApp(): express.Express {
  const app = express();

  // CORS: dev mặc định :5173; prod Vercel FE + API cùng domain (không cần CORS) —
  // vẫn giữ cấu hình qua env cho các trường hợp deploy khác domain.
  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    sendOk(res, { status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/families", familyRouter);
  app.use("/api/families/:id/categories", categoryRouter);
  app.use("/api/families/:id/expenses", expenseFamilyRouter);
  app.use("/api/families/:id/stats", statsRouter);
  app.use("/api/expenses", expenseRouter);
  app.use("/api", meRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
