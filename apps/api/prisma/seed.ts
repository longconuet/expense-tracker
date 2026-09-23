// Seed dữ liệu dev: 1 user + 1 family + preset categories.
// Chạy idempotent (upsert) — chạy lại nhiều lần không bị lỗi.
import { PrismaClient } from "@prisma/client";
import { PRESET_CATEGORIES } from "@expense-tracker/shared";

const prisma = new PrismaClient();

const TEST_EMAIL = "test@example.com";
const TEST_FAMILY_CODE = "TEST12";

async function main() {
  // 1. User test (passwordHash placeholder — task 3 sẽ dùng bcrypt thật)
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: {},
    create: {
      name: "Người dùng thử",
      email: TEST_EMAIL,
      passwordHash: "seed-placeholder",
    },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_EMAIL } });

  // 2. Family test
  const family = await prisma.family.upsert({
    where: { inviteCode: TEST_FAMILY_CODE },
    update: {},
    create: { name: "Gia đình Test", inviteCode: TEST_FAMILY_CODE },
  });

  // 3. Người dùng thử là owner của family
  await prisma.familyMember.upsert({
    where: { familyId_userId: { familyId: family.id, userId: user.id } },
    update: { role: "OWNER" },
    create: { familyId: family.id, userId: user.id, role: "OWNER" },
  });

  // 4. Preset categories (đồng bộ với shared)
  for (const [index, preset] of PRESET_CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { familyId_name: { familyId: family.id, name: preset.name } },
      update: { isPreset: true, order: index },
      create: {
        familyId: family.id,
        name: preset.name,
        icon: preset.icon,
        isPreset: true,
        order: index,
      },
    });
  }

  const [memberCount, categoryCount, expenseCount] = await Promise.all([
    prisma.familyMember.count({ where: { familyId: family.id } }),
    prisma.category.count({ where: { familyId: family.id } }),
    prisma.expense.count({ where: { familyId: family.id } }),
  ]);

  console.log(
    `[seed] user=${user.id} family=${family.id} (mã: ${TEST_FAMILY_CODE})`,
  );
  console.log(
    `[seed] thành viên: ${memberCount}, danh mục: ${categoryCount}, khoản chi: ${expenseCount}`,
  );
}

main()
  .catch((error) => {
    console.error("[seed] Lỗi:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
