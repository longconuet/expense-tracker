import { randomInt } from "node:crypto";
import { AppError } from "./apiError.js";
import { prisma } from "../prisma.js";

// Bỏ I, O, 0, 1 — dễ lẫn khi đọc/gõ tay
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function randomCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** Tạo mã mời 6 ký tự, unique trong bảng Family. */
export async function createUniqueInviteCode(excludeFamilyId?: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const clash = await prisma.family.findFirst({
      where: {
        inviteCode: code,
        ...(excludeFamilyId ? { NOT: { id: excludeFamilyId } } : {}),
      },
      select: { id: true },
    });
    if (!clash) return code;
  }
  throw new AppError(500, "CODE_GENERATION_FAILED", "Không tạo được mã mời, vui lòng thử lại");
}
