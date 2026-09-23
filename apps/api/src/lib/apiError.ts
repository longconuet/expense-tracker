import type { ApiMeta, ApiResponse } from "@expense-tracker/shared";
import type { ErrorRequestHandler, Request, Response } from "express";

/** Lỗi nghiệp vụ có sẵn status HTTP + mã lỗi cho envelope. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Trả về envelope success nhất quán. */
export function sendOk<T>(res: Response, data: T, meta?: ApiMeta, status = 200): void {
  const body: ApiResponse<T> = meta
    ? { success: true, data, error: null, meta }
    : { success: true, data, error: null };
  res.status(status).json(body);
}

export function notFoundHandler(_req: Request, res: Response): void {
  const body: ApiResponse<null> = {
    success: false,
    data: null,
    error: { code: "NOT_FOUND", message: "Không tìm thấy route" },
  };
  res.status(404).json(body);
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: err.code, message: err.message },
    };
    res.status(err.status).json(body);
    return;
  }

  console.error("[api] Lỗi không dự kiến:", err);
  const body: ApiResponse<null> = {
    success: false,
    data: null,
    error: { code: "INTERNAL_ERROR", message: "Có lỗi xảy ra, vui lòng thử lại" },
  };
  res.status(500).json(body);
};
