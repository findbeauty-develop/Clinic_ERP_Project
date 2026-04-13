-- Manual (non-platform) supplier return: clinic confirms completion on 반납 내역
ALTER TABLE "Return" ADD COLUMN IF NOT EXISTS "clinic_confirmed_at" TIMESTAMP(3);
