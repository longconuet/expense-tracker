import { randomUUID } from "node:crypto";
import type { CookieOptions } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

// Access và refresh ký bằng 2 secret riêng — refresh lộ không dùng được cho access.
const ACCESS_SECRET = env.jwtSecret;
const REFRESH_SECRET = `${env.jwtSecret}:refresh`;

export const ACCESS_TTL = "15m";
export const REFRESH_TTL = "30d";
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE = "etracker_refresh";

interface TokenPayload {
  sub: string;
  type: "access" | "refresh";
  jti: string;
}

// jti: mỗi token luôn duy nhất (kể cả cùng giây) — dùng được cho test/audit/rotate
export function signAccessToken(userId: string): string {
  return jwt.sign({ type: "access", jti: randomUUID() }, ACCESS_SECRET, {
    subject: userId,
    expiresIn: ACCESS_TTL,
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ type: "refresh", jti: randomUUID() }, REFRESH_SECRET, {
    subject: userId,
    expiresIn: REFRESH_TTL,
  });
}

function safeVerify(token: string, secret: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === "string" || !decoded || !("type" in decoded)) return null;
    const payload = decoded as Partial<TokenPayload>;
    if (typeof payload.sub !== "string") return null;
    if (payload.type !== "access" && payload.type !== "refresh") return null;
    return { sub: payload.sub, type: payload.type, jti: payload.jti ?? "" };
  } catch {
    return null;
  }
}

export function verifyAccessToken(token: string): TokenPayload | null {
  const payload = safeVerify(token, ACCESS_SECRET);
  return payload && payload.type === "access" ? payload : null;
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  const payload = safeVerify(token, REFRESH_SECRET);
  return payload && payload.type === "refresh" ? payload : null;
}

/** Cookie httpOnly, path hẹp (/api/auth) — chỉ refresh/logout nhận được. */
export function refreshCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    path: "/api/auth",
    maxAge: maxAgeMs,
  };
}
