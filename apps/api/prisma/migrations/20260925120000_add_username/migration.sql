-- Bình đẳng hoá đăng nhập: thêm username làm định danh login.
-- 1. Thêm cột (tạm nullable để backfill cho các user hiện có)
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- 2. Backfill từ phần trước @ của email:
--    - chỉ giữ [a-z0-9._], ký tự khác (vd gạch nối) thay bằng "_"
--    - bỏ dấu _/. ở đầu/cuối
--    - kết quả < 2 ký tự → fallback "user" + 8 ký tự đầu id
--    (email trong DB vốn đã lowercase do validate API)
UPDATE "User"
SET "username" = CASE
  WHEN char_length(regexp_replace(regexp_replace(split_part("email", '@', 1), '[^a-z0-9._]', '_', 'g'), '^[._]+|[._]+$', '', 'g')) >= 2
  THEN regexp_replace(regexp_replace(split_part("email", '@', 1), '[^a-z0-9._]', '_', 'g'), '^[._]+|[._]+$', '', 'g')
  ELSE 'user' || substr("id", 1, 8)
END
WHERE "username" IS NULL;

-- 3. Xử lý trùng (2 email khác nhau cùng sinh 1 username): gắn hậu tố _<n>
WITH ranked AS (
  SELECT "id", "username", ROW_NUMBER() OVER (PARTITION BY "username" ORDER BY "createdAt") AS rn
  FROM "User"
)
UPDATE "User" u
SET "username" = r."username" || '_' || r.rn
FROM ranked r
WHERE u."id" = r."id"
  AND r.rn > 1;

-- 4. Không cho NULL + unique
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- 5. Email chuyển sang nullable (user mới đăng ký không cần nhập email)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
