-- Clinic 교환 확인(확인) only after supplier 요청 확인 on exchanges
ALTER TABLE "DefectiveProductReturn" ADD COLUMN IF NOT EXISTS "supplier_accepted_at" TIMESTAMP(3);
