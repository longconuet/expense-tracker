import { Router } from "express";
import { AppError, sendOk } from "../lib/apiError.js";
import { MONTH_RE, currentMonth, nextMonthStart, prevMonthStart } from "../lib/dates.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireFamilyMember } from "../middlewares/requireFamily.js";
import { prisma } from "../prisma.js";

/**
 * Thống kê chi tiêu theo tháng: tổng, theo danh mục (%), theo ngày (đủ ngày trong tháng),
 * theo thành viên (mọi member hiện tại kể cả 0 chi + mọi người đã nhập khoản trong tháng,
 * kể cả người đã bị xoá khỏi family).
 * Mount: /api/families/:id/stats
 */
export const statsRouter = Router({ mergeParams: true });

statsRouter.get("/", requireAuth, requireFamilyMember(), async (req, res) => {
  const { familyId } = req.family!;

  const rawMonth = typeof req.query.month === "string" ? req.query.month : undefined;
  const month = rawMonth ?? currentMonth();
  if (!MONTH_RE.test(month)) {
    throw new AppError(400, "VALIDATION_ERROR", "month phải có dạng YYYY-MM");
  }

  const monthStart = `${month}-01`;
  const monthEnd = `${nextMonthStart(month)}-01`;
  const prevStart = `${prevMonthStart(month)}-01`;
  const whereMonth = { familyId, date: { gte: monthStart, lt: monthEnd } };

  const [sum, sumPrev, byCategoryGroups, byDayGroups, byMemberGroups] = await Promise.all([
    prisma.expense.aggregate({ where: whereMonth, _sum: { amount: true } }),
    prisma.expense.aggregate({
      where: { familyId, date: { gte: prevStart, lt: monthStart } },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({ by: ["categoryId"], where: whereMonth, _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ["date"], where: whereMonth, _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ["userId"], where: whereMonth, _sum: { amount: true } }),
  ]);

  const total = sum._sum.amount ?? 0;
  const previousMonthTotal = sumPrev._sum.amount ?? 0;

  // byCategory: join tên/icon category, percent 1 số thập phân, bỏ danh mục không có chi
  const categories = await prisma.category.findMany({
    where: { id: { in: byCategoryGroups.map((row) => row.categoryId) } },
  });
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const byCategory = byCategoryGroups
    .map((row) => {
      const rowTotal = row._sum.amount ?? 0;
      return {
        category: categoryMap.get(row.categoryId),
        total: rowTotal,
        percent: total > 0 ? Math.round((rowTotal / total) * 1000) / 10 : 0,
      };
    })
    .filter((row) => row.category !== undefined)
    .sort((a, b) => b.total - a.total);

  // byDay: đủ mọi ngày trong tháng, ngày không có chi = 0 (FE vẽ chart liền mạch)
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const dayTotals = new Map(byDayGroups.map((row) => [row.date, row._sum.amount ?? 0]));
  const byDay = Array.from({ length: daysInMonth }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    return { date, total: dayTotals.get(date) ?? 0 };
  });

  // byMember: MỌI thành viên hiện tại (kể cả 0 chi trong tháng) + mọi người đã nhập
  // khoản trong tháng (kể cả người đã bị xoá khỏi family — khoản của họ vẫn tồn tại,
  // tên lấy từ bảng User; user row không tồn tại — hiện không reachable vì app không
  // có xoá tài khoản — dùng tên mặc định) → tổng các hàng luôn = total
  const [members, creatorUsers] = await Promise.all([
    prisma.familyMember.findMany({
      where: { familyId },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.user.findMany({
      where: { id: { in: byMemberGroups.map((row) => row.userId) } },
      select: { id: true, name: true },
    }),
  ]);
  const memberRows = new Map<string, { name: string; total: number }>();
  for (const m of members) {
    memberRows.set(m.user.id, { name: m.user.name, total: 0 });
  }
  for (const row of byMemberGroups) {
    const amount = row._sum.amount ?? 0;
    const entry = memberRows.get(row.userId);
    if (entry) {
      entry.total += amount;
    } else {
      const name = creatorUsers.find((u) => u.id === row.userId)?.name ?? "Thành viên đã xoá";
      memberRows.set(row.userId, { name, total: amount });
    }
  }
  const byMember = [...memberRows.values()]
    .map((row) => ({
      name: row.name,
      total: row.total,
      percent: total > 0 ? Math.round((row.total / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi"));

  sendOk(res, { month, total, previousMonthTotal, byCategory, byDay, byMember });
});
