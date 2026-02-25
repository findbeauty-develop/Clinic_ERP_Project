-- AddColumn: Product.has_expiry_period (유효기간 있음 - 제품에 유효기간 추적 여부)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "has_expiry_period" BOOLEAN NOT NULL DEFAULT false;
