-- Outbound: 불량 박스 수 + 출고 시점 제품명/단위 스냅샷
ALTER TABLE "Outbound" ADD COLUMN IF NOT EXISTS "defective_box_count" INTEGER;
ALTER TABLE "Outbound" ADD COLUMN IF NOT EXISTS "product_name" TEXT;
ALTER TABLE "Outbound" ADD COLUMN IF NOT EXISTS "product_unit" TEXT;
