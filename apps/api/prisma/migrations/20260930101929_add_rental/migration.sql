-- CreateTable
CREATE TABLE "RentalConfig" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "rent" INTEGER NOT NULL DEFAULT 0,
    "internet" INTEGER NOT NULL DEFAULT 0,
    "elevator" INTEGER NOT NULL DEFAULT 0,
    "parking" INTEGER NOT NULL DEFAULT 0,
    "electricityRate" INTEGER NOT NULL DEFAULT 0,
    "waterRate" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalMonth" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "rent" INTEGER NOT NULL,
    "internet" INTEGER NOT NULL,
    "elevator" INTEGER NOT NULL,
    "parking" INTEGER NOT NULL,
    "oldElec" INTEGER NOT NULL,
    "newElec" INTEGER NOT NULL,
    "electricityRate" INTEGER NOT NULL,
    "oldWater" INTEGER NOT NULL,
    "newWater" INTEGER NOT NULL,
    "waterRate" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "expenseId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalMonth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentalConfig_familyId_key" ON "RentalConfig"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "RentalMonth_expenseId_key" ON "RentalMonth"("expenseId");

-- CreateIndex
CREATE INDEX "RentalMonth_familyId_idx" ON "RentalMonth"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "RentalMonth_familyId_month_key" ON "RentalMonth"("familyId", "month");

-- AddForeignKey
ALTER TABLE "RentalConfig" ADD CONSTRAINT "RentalConfig_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalMonth" ADD CONSTRAINT "RentalMonth_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalMonth" ADD CONSTRAINT "RentalMonth_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: preset category "Nhà trọ" 🏠 cho mọi family đã tồn tại
-- (family MỚI tự có từ PRESET_CATEGORIES — code phía application).
-- Idempotent: NOT EXISTS theo (familyId, name); id deterministic md5.
INSERT INTO "Category" ("id", "familyId", "name", "icon", "isPreset", "order")
SELECT md5('rental-' || f.id), f.id, 'Nhà trọ', '🏠', true,
       (SELECT COALESCE(MAX(c2.order), 0) FROM "Category" c2 WHERE c2."familyId" = f.id) + 1
FROM "Family" f
WHERE NOT EXISTS (
    SELECT 1 FROM "Category" c WHERE c."familyId" = f.id AND c.name = 'Nhà trọ'
);
