-- Add unit column to Batch table
ALTER TABLE "Batch" ADD COLUMN "unit" TEXT;

-- Add comment for documentation
COMMENT ON COLUMN "Batch"."unit" IS 'Unit from product (e.g., EA, BOX, cc/mL, etc.)';

