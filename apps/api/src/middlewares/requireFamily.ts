import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/apiError.js";
import { prisma } from "../prisma.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      family?: { familyId: string; role: string };
    }
  }
}

/**
 * Yêu cầu req.auth (gọi TRƯỚC middleware này) + user phải là thành viên của family :id.
 * Gắn req.family = { familyId, role } cho route phía sau (dùng chung ở task 5, 6).
 */
export function requireFamilyMember(familyIdParam = "id") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (async () => {
      const { userId } = req.auth!;
      const raw = req.params[familyIdParam];
      const familyId = Array.isArray(raw) ? undefined : raw;
      if (!familyId) {
        throw new AppError(400, "BAD_REQUEST", "Thiếu family id");
      }

      const membership = await prisma.familyMember.findUnique({
        where: { familyId_userId: { familyId, userId } },
      });

      if (!membership) {
        throw new AppError(403, "NOT_FAMILY_MEMBER", "Bạn không phải thành viên của gia đình này");
      }

      req.family = { familyId, role: membership.role };
      next();
    })().catch(next);
  };
}

/** Yêu cầu user đang là OWNER của family (gọi sau requireFamilyMember). */
export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  if (req.family?.role !== "OWNER") {
    next(new AppError(403, "OWNER_ONLY", "Chỉ chủ gia đình mới được thực hiện thao tác này"));
    return;
  }
  next();
}
