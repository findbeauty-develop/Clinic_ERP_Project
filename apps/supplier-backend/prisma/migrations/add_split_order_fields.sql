-- Add split order fields to SupplierOrder table
ALTER TABLE "SupplierOrder" 
ADD COLUMN "original_order_id" VARCHAR(36),
ADD COLUMN "is_split_order" BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN "split_sequence" INTEGER,
ADD COLUMN "split_reason" TEXT;

-- Create index for better query performance
CREATE INDEX "SupplierOrder_original_order_id_idx" ON "SupplierOrder"("original_order_id");

-- Add comment for documentation
COMMENT ON COLUMN "SupplierOrder"."original_order_id" IS 'If this is a split order, points to the original order ID';
COMMENT ON COLUMN "SupplierOrder"."is_split_order" IS 'True if this order was created from an order split';
COMMENT ON COLUMN "SupplierOrder"."split_sequence" IS 'Sequence number for split orders (1, 2, 3...)';
COMMENT ON COLUMN "SupplierOrder"."split_reason" IS 'Reason why this order was split';

