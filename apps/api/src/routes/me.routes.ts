import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { sendOk } from "../lib/apiError.js";
import { prisma } from "../prisma.js";

export const meRouter = Router();

/** Người dùng hiện tại + danh sách family của user (kèm role). */
meRouter.get("/me", requireAuth, async (req, res) => {
  const { userId } = req.auth!;

  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.familyMember.findMany({
      where: { userId },
      include: {
        family: {
          include: {
            _count: { select: { members: true } },
            members: { select: { role: true, user: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
  ]);

  if (!user) {
    res.status(401).json({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", message: "Tài khoản không còn tồn tại" },
    });
    return;
  }

  const families = memberships.map((membership) => {
    const owner = membership.family.members.find((m) => m.role === "OWNER")?.user;
    return {
      id: membership.family.id,
      name: membership.family.name,
      inviteCode: membership.family.inviteCode,
      ownerName: owner?.name ?? "",
      memberCount: membership.family._count.members,
      // Khớp field `myRole` của type Family trong @expense-tracker/shared
      myRole: membership.role,
    };
  });

  sendOk(res, {
    user: { id: user.id, name: user.name, email: user.email },
    families,
  });
});
