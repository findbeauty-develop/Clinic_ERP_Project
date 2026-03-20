-- Add rejection_member_name to OrderItem
ALTER TABLE "OrderItem" ADD COLUMN "rejection_member_name" TEXT;

-- Drop RejectedOrder table (data is now stored in OrderItem.rejection_member_name)
DROP TABLE IF EXISTS "RejectedOrder";
