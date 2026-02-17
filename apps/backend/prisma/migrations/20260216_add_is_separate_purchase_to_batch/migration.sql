-- AlterTable
ALTER TABLE "Batch" ADD COLUMN "is_separate_purchase" BOOLEAN NOT NULL DEFAULT false;

-- Comment
COMMENT ON COLUMN "Batch"."is_separate_purchase" IS '별도 구매 (true) vs 바코드 입고/Supplier주문 (false)';

