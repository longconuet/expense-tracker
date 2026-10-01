-- ============================================================================
-- SỬA LẠI order CỦA "Category" — chạy khi thấy list danh mục "nhảy thứ tự"
-- ----------------------------------------------------------------------------
-- Background: cách đổi thứ tự cũ (FE gửi 2 PUT song song hoán đổi order) có thể
-- fail một nửa → 2 category trùng giá trị `order`. Khi đó GET /categories
-- (ORDER BY order ASC) KHÔNG bảo đảm thứ tự hàng trùng key → list nhảy loạn
-- mỗi lần fetch. Script này gán lại order liên tục 0..n-1 cho mỗi family,
-- GIỮ NGUYÊN thứ tự hiển thị hiện tại (order, id) của từng family.
--
-- Chạy (chọn 1):
--   Dev local:
--     docker compose -f docker-compose.dev.yml exec -T postgres \
--       psql -U etracker -d expense_tracker < apps/api/prisma/repair_category_order.sql
--   (DB test/e2e: đổi tên DB thành expense_tracker_test / expense_tracker_e2e)
--   Production (Supabase): paste nội dung file này vào SQL Editor rồi Run.
--
-- Idempotent — chạy lại nhiều lần cũng an toàn (row đã đúng order sẽ không UPDATE).
-- Nên chạy khi không ai đang reorder trên app (nếu đúng lúc đang swap, thao tác
-- đó có thể bị ghi đè — tự lành khi member đó reorder lại hoặc chạy lại script).
-- Kiểm tra trước/sau:
--   SELECT "familyId", "order", count(*) FROM "Category"
--   GROUP BY "familyId", "order" HAVING count(*) > 1;  -- mong đợi: 0 rows
-- ============================================================================

WITH ordered AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY "familyId" ORDER BY "order", id) - 1 AS new_order
  FROM "Category"
)
UPDATE "Category" c
SET "order" = o.new_order
FROM ordered o
WHERE c.id = o.id
  AND c."order" <> o.new_order;
