-- Migration already applied via prisma db push
-- This is a duplicate migration (20260102130000_add_clinic_support_center already exists)
-- Placeholder migration file
-- CreateTable ClinicSupportCenter (already created in previous migration)
CREATE TABLE IF NOT EXISTS "ClinicSupportCenter" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "member_name" TEXT NOT NULL,
    "clinic_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "inquiry" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicSupportCenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClinicSupportCenter_tenant_id_idx" ON "ClinicSupportCenter"("tenant_id");
CREATE INDEX IF NOT EXISTS "ClinicSupportCenter_created_at_idx" ON "ClinicSupportCenter"("created_at");
CREATE INDEX IF NOT EXISTS "ClinicSupportCenter_tenant_id_created_at_idx" ON "ClinicSupportCenter"("tenant_id", "created_at");
