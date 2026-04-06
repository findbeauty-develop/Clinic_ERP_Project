-- Clinic confirms exchange receipt (반품 진행중 → 확인): product_received + received_at
ALTER TABLE "DefectiveProductReturn" ADD COLUMN "product_received" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DefectiveProductReturn" ADD COLUMN "received_at" TIMESTAMP(3);
