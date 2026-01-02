-- CreateTable
CREATE TABLE "ClinicSupportCenter" (
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
CREATE INDEX "ClinicSupportCenter_tenant_id_idx" ON "ClinicSupportCenter"("tenant_id");

-- CreateIndex
CREATE INDEX "ClinicSupportCenter_created_at_idx" ON "ClinicSupportCenter"("created_at");

-- CreateIndex
CREATE INDEX "ClinicSupportCenter_tenant_id_created_at_idx" ON "ClinicSupportCenter"("tenant_id", "created_at");

