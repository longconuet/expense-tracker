import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Router, type Response } from "express";
import { z } from "zod";
import {
  REFRESH_COOKIE,
  REFRESH_TTL_MS,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/auth.js";
import { AppError, sendOk } from "../lib/apiError.js";
import { validateBody } from "../lib/validate.js";
import { prisma } from "../prisma.js";

// trim + lowercase TRƯỚC khi validate email — " A@b.com " vẫn hợp lệ
const emailField = z.string().trim().toLowerCase().email();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(50),
  email: emailField,
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1),
});

function publicUser(user: User) {
  return { id: user.id, name: user.name, email: user.email };
}

/** Trả access token mới + set lại refresh cookie (rotation). */
function issueTokens(res: Response, userId: string): string {
  const accessToken = signAccessToken(userId);
  res.cookie(REFRESH_COOKIE, signRefreshToken(userId), refreshCookieOptions(REFRESH_TTL_MS));
  return accessToken;
}

export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, "EMAIL_EXISTS", "Email đã được đăng ký");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name, email, passwordHash } });

  const accessToken = issueTokens(res, user.id);
  sendOk(res, { user: publicUser(user), accessToken }, undefined, 201);
});

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  // Cùng 1 thông báo cho cả 2 trường hợp — không tiết lộ email có tồn tại hay không
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");
  }

  const accessToken = issueTokens(res, user.id);
  sendOk(res, { user: publicUser(user), accessToken });
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "Thiếu refresh token");
  }

  const payload = verifyRefreshToken(token);
  if (!payload) {
    throw new AppError(401, "UNAUTHORIZED", "Refresh token không hợp lệ hoặc đã hết hạn");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new AppError(401, "UNAUTHORIZED", "Tài khoản không còn tồn tại");
  }

  const accessToken = issueTokens(res, user.id);
  sendOk(res, { user: publicUser(user), accessToken });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(0));
  sendOk(res, { ok: true });
});
