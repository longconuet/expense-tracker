import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/apiError.js";
import { verifyAccessToken } from "../lib/auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string };
    }
  }
}

/** Bắt buộc header `Authorization: Bearer <access>` hợp lệ — gắn req.auth. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(new AppError(401, "UNAUTHORIZED", "Thiếu access token"));
    return;
  }

  const payload = verifyAccessToken(header.slice("Bearer ".length));
  if (!payload) {
    next(new AppError(401, "UNAUTHORIZED", "Access token không hợp lệ hoặc đã hết hạn"));
    return;
  }

  req.auth = { userId: payload.sub };
  next();
}
