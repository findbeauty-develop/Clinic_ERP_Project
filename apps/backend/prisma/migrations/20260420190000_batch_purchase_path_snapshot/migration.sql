-- 입고 배치에 주문 시점 구매 경로 스냅샷 보존 (출고 등에서 기본 경로 대신 표시)
ALTER TABLE "Batch" ADD COLUMN "purchase_path_snapshot" JSONB;
ALTER TABLE "Batch" ADD COLUMN "purchase_path_type" "PurchasePathType";
