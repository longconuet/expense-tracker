import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "./apiError.js";

/** Validate req.body bằng zod — lỗi trả 400 VALIDATION_ERROR kèm chi tiết. */
export function validateBody<S extends ZodType>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${[...issue.path].map(String).join(".") || "body"}: ${issue.message}`)
        .join("; ");
      next(new AppError(400, "VALIDATION_ERROR", message));
      return;
    }
    req.body = result.data;
    next();
  };
}
