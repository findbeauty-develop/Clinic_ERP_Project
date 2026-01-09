-- Add min_stock column to Batch table
ALTER TABLE "Batch" ADD COLUMN "min_stock" INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN "Batch"."min_stock" IS 'Minimum stock from product (immutable)';

