-- Add outbound_count field to Batch table
-- This field tracks total outbound quantity (including damaged/defective)
-- used_count tracks only actually used products (for empty box calculation)

ALTER TABLE "Batch" ADD COLUMN "outbound_count" INTEGER NOT NULL DEFAULT 0;

-- Update existing batches: set outbound_count = used_count for existing data
UPDATE "Batch" SET "outbound_count" = COALESCE("used_count", 0);

-- Add comment
COMMENT ON COLUMN "Batch"."outbound_count" IS 'Total quantity that left warehouse (all outbound types)';
COMMENT ON COLUMN "Batch"."used_count" IS 'Quantity actually used (only normal outbound, for empty box calculation)';

