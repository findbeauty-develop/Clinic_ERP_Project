-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplierRegionTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierRegionTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplierProductTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierProductTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierRegionTag_name_key" ON "SupplierRegionTag"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierRegionTag_name_idx" ON "SupplierRegionTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierProductTag_name_key" ON "SupplierProductTag"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierProductTag_name_idx" ON "SupplierProductTag"("name");
