import { PRESET_CATEGORIES } from "@expense-tracker/shared";
import type { FamilyMemberDto } from "@expense-tracker/shared";
import { Router } from "express";
import { z } from "zod";
import { createUniqueInviteCode } from "../lib/inviteCode.js";
import { AppError, sendOk } from "../lib/apiError.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireFamilyMember, requireOwner } from "../middlewares/requireFamily.js";
import { prisma } from "../prisma.js";

const familyNameSchema = z.string().trim().min(2).max(50);

const createFamilySchema = z.object({ name: familyNameSchema });
const joinFamilySchema = z.object({ code: z.string().trim().min(6).max(6) });

async function familyDto(familyId: string, viewerUserId: string) {
  const family = await prisma.family.findUniqueOrThrow({
    where: { id: familyId },
    include: {
      _count: { select: { members: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  const members: FamilyMemberDto[] = family.members.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    role: m.role as "OWNER" | "MEMBER",
    joinedAt: m.joinedAt.toISOString(),
  }));

  return {
    id: family.id,
    name: family.name,
    inviteCode: family.inviteCode,
    ownerName: family.members.find((m) => m.role === "OWNER")?.user.name ?? "",
    memberCount: family._count.members,
    myRole: family.members.find((m) => m.user.id === viewerUserId)?.role ?? "MEMBER",
    members,
  };
}

export const familyRouter = Router();

familyRouter.use(requireAuth);

/** Tạo family mới — người tạo thành OWNER, tự seed preset categories. */
familyRouter.post("/", validateBody(createFamilySchema), async (req, res) => {
  const { userId } = req.auth!;
  const inviteCode = await createUniqueInviteCode();

  const family = await prisma.$transaction(async (tx) => {
    const created = await tx.family.create({
      data: { name: req.body.name, inviteCode },
    });
    await tx.familyMember.create({
      data: { familyId: created.id, userId, role: "OWNER" },
    });
    for (const [order, preset] of PRESET_CATEGORIES.entries()) {
      await tx.category.create({
        data: {
          familyId: created.id,
          name: preset.name,
          icon: preset.icon,
          isPreset: true,
          order,
        },
      });
    }
    return created;
  });

  sendOk(res, { family: await familyDto(family.id, userId) }, undefined, 201);
});

/** Vào family bằng mã mời — thành MEMBER. */
familyRouter.post("/join", validateBody(joinFamilySchema), async (req, res) => {
  const { userId } = req.auth!;
  const code = req.body.code.toUpperCase();

  const family = await prisma.family.findUnique({ where: { inviteCode: code } });
  if (!family) {
    throw new AppError(404, "FAMILY_NOT_FOUND", "Không tìm thấy gia đình với mã này");
  }

  const existing = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId: family.id, userId } },
  });
  if (existing) {
    throw new AppError(409, "ALREADY_MEMBER", "Bạn đã là thành viên của gia đình này");
  }

  await prisma.familyMember.create({ data: { familyId: family.id, userId, role: "MEMBER" } });

  sendOk(res, { family: await familyDto(family.id, userId) }, undefined, 201);
});

/** Chi tiết family + danh sách thành viên (chỉ thành viên xem được). */
familyRouter.get("/:id", requireFamilyMember(), async (req, res) => {
  const { familyId } = req.family!;
  sendOk(res, { family: await familyDto(familyId, req.auth!.userId) });
});

/** Tạo mã mời mới (chỉ owner). */
familyRouter.post("/:id/regenerate-code", requireFamilyMember(), requireOwner, async (req, res) => {
  const { familyId } = req.family!;
  const inviteCode = await createUniqueInviteCode(familyId);
  const family = await prisma.family.update({
    where: { id: familyId },
    data: { inviteCode },
  });
  sendOk(res, { inviteCode: family.inviteCode });
});

/** Xoá thành viên: owner xoá member, hoặc tự xoá (rời family). Owner không tự rời. */
familyRouter.delete("/:id/members/:userId", requireFamilyMember(), async (req, res) => {
  const { familyId, role } = req.family!;
  const targetUserId = String(req.params.userId ?? "");
  if (!targetUserId) {
    throw new AppError(400, "BAD_REQUEST", "Thiếu user id");
  }
  const isSelf = targetUserId === req.auth!.userId;

  if (!isSelf && role !== "OWNER") {
    throw new AppError(403, "OWNER_ONLY", "Chỉ chủ gia đình mới xoá được thành viên khác");
  }
  if (isSelf && role === "OWNER") {
    throw new AppError(400, "OWNER_CANNOT_LEAVE", "Chủ gia đình không thể tự rời — hãy xoá gia đình");
  }

  await prisma.familyMember.delete({
    where: { familyId_userId: { familyId, userId: targetUserId } },
  });

  sendOk(res, { ok: true });
});

/** Xoá cả family (chỉ owner, khi không còn thành viên khác). */
familyRouter.delete("/:id", requireFamilyMember(), requireOwner, async (req, res) => {
  const { familyId } = req.family!;

  const memberCount = await prisma.familyMember.count({ where: { familyId } });
  if (memberCount > 1) {
    throw new AppError(409, "FAMILY_NOT_EMPTY", "Chỉ xoá được gia đình khi không còn thành viên khác");
  }

  await prisma.family.delete({ where: { id: familyId } });
  sendOk(res, { ok: true });
});
