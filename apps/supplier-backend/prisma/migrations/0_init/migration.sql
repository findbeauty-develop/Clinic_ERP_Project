-- CreateTable
CREATE TABLE IF NOT EXISTS "Supplier" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_name" TEXT NOT NULL,
    "business_number" TEXT NOT NULL,
    "company_phone" TEXT,
    "company_email" TEXT NOT NULL,
    "company_address" TEXT,
    "business_type" TEXT,
    "business_item" TEXT,
    "product_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "share_consent" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplierManager" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "certificate_image_url" TEXT,
    "password_hash" TEXT NOT NULL,
    "email1" TEXT NOT NULL,
    "email2" TEXT,
    "responsible_regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responsible_products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "SupplierManager_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_business_number_key" ON "Supplier"("business_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Supplier_tenant_id_idx" ON "Supplier"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Supplier_business_number_idx" ON "Supplier"("business_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Supplier_status_idx" ON "Supplier"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierManager_manager_id_key" ON "SupplierManager"("manager_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierManager_phone_number_key" ON "SupplierManager"("phone_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierManager_supplier_id_idx" ON "SupplierManager"("supplier_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierManager_manager_id_idx" ON "SupplierManager"("manager_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierManager_phone_number_idx" ON "SupplierManager"("phone_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierManager_email1_idx" ON "SupplierManager"("email1");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierManager_status_idx" ON "SupplierManager"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierRegionTag_name_key" ON "SupplierRegionTag"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierRegionTag_name_idx" ON "SupplierRegionTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierProductTag_name_key" ON "SupplierProductTag"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierProductTag_name_idx" ON "SupplierProductTag"("name");

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'SupplierManager_supplier_id_fkey'
    ) THEN
        ALTER TABLE "SupplierManager" ADD CONSTRAINT "SupplierManager_supplier_id_fkey" 
        FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
