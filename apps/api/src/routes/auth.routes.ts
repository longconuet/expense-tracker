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

// trim + lowercase TRƯỚC khi validate username — " An2310 " vẫn hợp lệ
// 2-20 ký tự, chữ thường/số/dấu chấm_gạch dưới, bắt đầu & kết thúc bằng chữ hoặc số
const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._]{0,18}[a-z0-9]$/, {
    message: "Tên đăng nhập phải 2-20 ký tự: chữ thường, số, dấu . _ (không bắt đầu/kết thúc bằng . _)",
  });

const registerSchema = z.object({
  name: z.string().trim().min(2).max(50),
  username: usernameField,
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  username: usernameField,
  password: z.string().min(1),
});

function publicUser(user: User) {
  return { id: user.id, name: user.name, username: user.username };
}

/** Trả access token mới + set lại refresh cookie (rotation). */
function issueTokens(res: Response, userId: string): string {
  const accessToken = signAccessToken(userId);
  res.cookie(REFRESH_COOKIE, signRefreshToken(userId), refreshCookieOptions(REFRESH_TTL_MS));
  return accessToken;
}

export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), async (req, res) => {
  const { name, username, password } = req.body;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    throw new AppError(409, "USERNAME_TAKEN", "Tên đăng nhập đã được sử dụng");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name, username, passwordHash } });

  const accessToken = issueTokens(res, user.id);
  sendOk(res, { user: publicUser(user), accessToken }, undefined, 201);
});

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  const { username, password } = req.body;

  const user = await prisma.user.findUnique({ where: { username } });
  // Cùng 1 thông báo cho cả 2 trường hợp — không tiết lộ username có tồn tại hay không
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng");
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
