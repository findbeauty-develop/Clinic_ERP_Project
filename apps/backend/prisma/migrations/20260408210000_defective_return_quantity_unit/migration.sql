-- DefectiveProductReturn: 반품 수량 표시 단위 (Outbound.product_unit 스냅샷)
ALTER TABLE "DefectiveProductReturn" ADD COLUMN IF NOT EXISTS "quantity_unit" TEXT;
