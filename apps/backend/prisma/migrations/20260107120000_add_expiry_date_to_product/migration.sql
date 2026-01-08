-- Add expiry_date column to Product table
-- This is for product-level expiry date display (유효기간)

ALTER TABLE "Product" ADD COLUMN "expiry_date" TIMESTAMP(3);

COMMENT ON COLUMN "Product"."expiry_date" IS 'Product-level expiry date for display purposes (유효기간)';

