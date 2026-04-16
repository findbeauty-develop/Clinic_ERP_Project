-- Manual Supplier: do not require a synthetic company_email when clinic leaves it blank
ALTER TABLE "Supplier" ALTER COLUMN "company_email" DROP NOT NULL;
