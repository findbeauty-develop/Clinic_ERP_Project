-- AddColumn: product_name to OrderItem
-- 주문 시점의 제품명 스냅샷 저장 (nullable — 기존 레코드는 NULL 유지)
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "product_name" TEXT;
