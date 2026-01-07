-- Add inbound_qty to Product table
ALTER TABLE "Product" ADD COLUMN "inbound_qty" INTEGER;

-- Add inbound_qty to Batch table
ALTER TABLE "Batch" ADD COLUMN "inbound_qty" INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN "Product"."inbound_qty" IS 'Original quantity from first inbound operation (immutable)';
COMMENT ON COLUMN "Batch"."inbound_qty" IS 'Original quantity when batch was created (immutable)';

