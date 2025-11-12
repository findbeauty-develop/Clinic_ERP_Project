-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "member_code" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "clinic_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" TIMESTAMP(3),
    "updated_by" TEXT,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_member_code_key" ON "Member"("member_code");

-- CreateIndex
CREATE INDEX "Member_tenant_id_idx" ON "Member"("tenant_id");
