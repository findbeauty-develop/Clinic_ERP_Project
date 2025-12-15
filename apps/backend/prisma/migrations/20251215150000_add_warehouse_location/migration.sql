-- CreateTable
CREATE TABLE IF NOT EXISTS "WarehouseLocation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "items" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "WarehouseLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WarehouseLocation_tenant_id_idx" ON "WarehouseLocation"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WarehouseLocation_category_idx" ON "WarehouseLocation"("category");

-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WarehouseLocation_tenant_id_name_key" ON "WarehouseLocation"("tenant_id", "name");

