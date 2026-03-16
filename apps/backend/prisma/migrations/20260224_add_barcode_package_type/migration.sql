-- CreateEnum
CREATE TYPE "BarcodePackageType" AS ENUM ('BOX', 'AMPULE', 'VIAL', 'UNIT', 'SYRINGE', 'BOTTLE', 'OTHER');

-- AlterTable: add barcode_package_type column to ProductGTIN
ALTER TABLE "ProductGTIN" ADD COLUMN "barcode_package_type" "BarcodePackageType" NOT NULL DEFAULT 'BOX';
