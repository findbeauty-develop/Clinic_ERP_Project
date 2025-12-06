-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "brand" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "current_stock" INTEGER NOT NULL DEFAULT 0,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT '활성',
    "unit" TEXT,
    "purchase_price" INTEGER,
    "sale_price" INTEGER,
    "capacity_per_product" INTEGER,
    "capacity_unit" TEXT,
    "usage_capacity" INTEGER,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "english_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "medical_subjects" TEXT NOT NULL,
    "license_type" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "document_issue_number" TEXT NOT NULL,
    "document_image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" TIMESTAMP(3),
    "updated_by" TEXT,
    "doctor_name" TEXT,
    "open_date" TIMESTAMP(3),

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "clinic_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" TIMESTAMP(3),
    "updated_by" TEXT,
    "full_name" TEXT,
    "phone_number" TEXT,
    "id_card_number" TEXT,
    "address" TEXT,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnPolicy" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "is_returnable" BOOLEAN NOT NULL DEFAULT false,
    "refund_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "return_storage" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "ReturnPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_no" TEXT NOT NULL,
    "storage" TEXT,
    "purchase_price" INTEGER,
    "sale_price" INTEGER,
    "manufacture_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "expiry_months" INTEGER,
    "qty" INTEGER NOT NULL,
    "alert_days" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "expiry_unit" TEXT,
    "inbound_manager" TEXT,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProduct" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "purchase_price" INTEGER,
    "moq" INTEGER,
    "lead_time_days" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "supplier_tenant_id" TEXT,
    "company_name" TEXT,

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbound" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "batch_no" TEXT NOT NULL,
    "outbound_qty" INTEGER NOT NULL,
    "outbound_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manager_name" TEXT NOT NULL,
    "patient_name" TEXT,
    "chart_number" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "created_by" TEXT,
    "is_damaged" BOOLEAN NOT NULL DEFAULT false,
    "is_defective" BOOLEAN NOT NULL DEFAULT false,
    "outbound_type" TEXT NOT NULL DEFAULT '제품',
    "package_id" TEXT,

    CONSTRAINT "Outbound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageItem" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageReservation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "reserved_qty" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "PackageReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Return" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "outbound_id" TEXT,
    "batch_no" TEXT NOT NULL,
    "supplier_id" TEXT,
    "return_qty" INTEGER NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refund_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_refund" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manager_name" TEXT NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "created_by" TEXT,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "supplier_id" TEXT,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_delivery_date" TIMESTAMP(3),
    "created_by" TEXT,
    "approved_by" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total_price" INTEGER NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDraft" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "business_number" TEXT NOT NULL,
    "company_phone" TEXT,
    "company_email" TEXT NOT NULL,
    "company_address" TEXT,
    "product_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "share_consent" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'MANUAL_ONLY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicSupplierLink" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "blocked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "supplier_manager_id" TEXT NOT NULL,

    CONSTRAINT "ClinicSupplierLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicSupplierManager" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "email1" TEXT,
    "email2" TEXT,
    "position" TEXT,
    "certificate_image_url" TEXT,
    "responsible_regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responsible_products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "ClinicSupplierManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierManager" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "certificate_image_url" TEXT,
    "password_hash" TEXT,
    "email1" TEXT,
    "responsible_products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "position" TEXT,
    "clinic_manager_id" TEXT,
    "supplier_tenant_id" TEXT NOT NULL,
    "manager_address" TEXT,
    "created_by" TEXT,

    CONSTRAINT "SupplierManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturnNotification" (
    "id" TEXT NOT NULL,
    "supplier_manager_id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "clinic_tenant_id" TEXT NOT NULL,
    "clinic_name" TEXT,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_brand" TEXT NOT NULL,
    "product_code" TEXT,
    "return_qty" INTEGER NOT NULL,
    "refund_amount_per_item" DOUBLE PRECISION NOT NULL,
    "total_refund" DOUBLE PRECISION NOT NULL,
    "return_manager_name" TEXT NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL,
    "batch_no" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),

    CONSTRAINT "SupplierReturnNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_tenant_id" TEXT NOT NULL,
    "supplier_manager_id" TEXT,
    "clinic_tenant_id" TEXT,
    "clinic_name" TEXT,
    "clinic_manager_name" TEXT,
    "order_no" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT,
    "order_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrderItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "product_id" TEXT,
    "product_name" TEXT NOT NULL,
    "brand" TEXT,
    "batch_no" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total_price" INTEGER NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "SupplierOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_tenant_id_idx" ON "Product"("tenant_id");

-- CreateIndex
CREATE INDEX "Clinic_tenant_id_idx" ON "Clinic"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "Member_member_id_key" ON "Member"("member_id");

-- CreateIndex
CREATE INDEX "Member_tenant_id_idx" ON "Member"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnPolicy_product_id_key" ON "ReturnPolicy"("product_id");

-- CreateIndex
CREATE INDEX "ReturnPolicy_tenant_id_idx" ON "ReturnPolicy"("tenant_id");

-- CreateIndex
CREATE INDEX "Batch_tenant_id_idx" ON "Batch"("tenant_id");

-- CreateIndex
CREATE INDEX "Batch_product_id_idx" ON "Batch"("product_id");

-- CreateIndex
CREATE INDEX "Batch_tenant_id_product_id_idx" ON "Batch"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "SupplierProduct_tenant_id_idx" ON "SupplierProduct"("tenant_id");

-- CreateIndex
CREATE INDEX "SupplierProduct_product_id_idx" ON "SupplierProduct"("product_id");

-- CreateIndex
CREATE INDEX "SupplierProduct_supplier_id_idx" ON "SupplierProduct"("supplier_id");

-- CreateIndex
CREATE INDEX "SupplierProduct_supplier_tenant_id_idx" ON "SupplierProduct"("supplier_tenant_id");

-- CreateIndex
CREATE INDEX "SupplierProduct_tenant_id_product_id_idx" ON "SupplierProduct"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "Outbound_tenant_id_idx" ON "Outbound"("tenant_id");

-- CreateIndex
CREATE INDEX "Outbound_product_id_idx" ON "Outbound"("product_id");

-- CreateIndex
CREATE INDEX "Outbound_batch_id_idx" ON "Outbound"("batch_id");

-- CreateIndex
CREATE INDEX "Outbound_outbound_date_idx" ON "Outbound"("outbound_date");

-- CreateIndex
CREATE INDEX "Outbound_outbound_type_idx" ON "Outbound"("outbound_type");

-- CreateIndex
CREATE INDEX "Outbound_tenant_id_outbound_date_idx" ON "Outbound"("tenant_id", "outbound_date");

-- CreateIndex
CREATE INDEX "Package_tenant_id_idx" ON "Package"("tenant_id");

-- CreateIndex
CREATE INDEX "Package_tenant_id_is_active_idx" ON "Package"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "PackageItem_tenant_id_idx" ON "PackageItem"("tenant_id");

-- CreateIndex
CREATE INDEX "PackageItem_package_id_idx" ON "PackageItem"("package_id");

-- CreateIndex
CREATE INDEX "PackageItem_product_id_idx" ON "PackageItem"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "PackageItem_package_id_product_id_key" ON "PackageItem"("package_id", "product_id");

-- CreateIndex
CREATE INDEX "PackageReservation_tenant_id_idx" ON "PackageReservation"("tenant_id");

-- CreateIndex
CREATE INDEX "PackageReservation_package_id_idx" ON "PackageReservation"("package_id");

-- CreateIndex
CREATE INDEX "PackageReservation_product_id_idx" ON "PackageReservation"("product_id");

-- CreateIndex
CREATE INDEX "PackageReservation_batch_id_idx" ON "PackageReservation"("batch_id");

-- CreateIndex
CREATE INDEX "PackageReservation_tenant_id_package_id_idx" ON "PackageReservation"("tenant_id", "package_id");

-- CreateIndex
CREATE INDEX "PackageReservation_tenant_id_product_id_idx" ON "PackageReservation"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "PackageReservation_tenant_id_batch_id_idx" ON "PackageReservation"("tenant_id", "batch_id");

-- CreateIndex
CREATE INDEX "Return_tenant_id_idx" ON "Return"("tenant_id");

-- CreateIndex
CREATE INDEX "Return_product_id_idx" ON "Return"("product_id");

-- CreateIndex
CREATE INDEX "Return_batch_id_idx" ON "Return"("batch_id");

-- CreateIndex
CREATE INDEX "Return_outbound_id_idx" ON "Return"("outbound_id");

-- CreateIndex
CREATE INDEX "Return_return_date_idx" ON "Return"("return_date");

-- CreateIndex
CREATE INDEX "Return_tenant_id_return_date_idx" ON "Return"("tenant_id", "return_date");

-- CreateIndex
CREATE UNIQUE INDEX "Order_order_no_key" ON "Order"("order_no");

-- CreateIndex
CREATE INDEX "Order_tenant_id_idx" ON "Order"("tenant_id");

-- CreateIndex
CREATE INDEX "Order_supplier_id_idx" ON "Order"("supplier_id");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_order_date_idx" ON "Order"("order_date");

-- CreateIndex
CREATE INDEX "Order_tenant_id_status_idx" ON "Order"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "Order_tenant_id_order_date_idx" ON "Order"("tenant_id", "order_date");

-- CreateIndex
CREATE INDEX "OrderItem_tenant_id_idx" ON "OrderItem"("tenant_id");

-- CreateIndex
CREATE INDEX "OrderItem_order_id_idx" ON "OrderItem"("order_id");

-- CreateIndex
CREATE INDEX "OrderItem_product_id_idx" ON "OrderItem"("product_id");

-- CreateIndex
CREATE INDEX "OrderItem_batch_id_idx" ON "OrderItem"("batch_id");

-- CreateIndex
CREATE INDEX "OrderItem_tenant_id_order_id_idx" ON "OrderItem"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "OrderDraft_tenant_id_idx" ON "OrderDraft"("tenant_id");

-- CreateIndex
CREATE INDEX "OrderDraft_session_id_idx" ON "OrderDraft"("session_id");

-- CreateIndex
CREATE INDEX "OrderDraft_expires_at_idx" ON "OrderDraft"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "OrderDraft_tenant_id_session_id_key" ON "OrderDraft"("tenant_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenant_id_key" ON "Supplier"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_business_number_key" ON "Supplier"("business_number");

-- CreateIndex
CREATE INDEX "Supplier_tenant_id_idx" ON "Supplier"("tenant_id");

-- CreateIndex
CREATE INDEX "Supplier_business_number_idx" ON "Supplier"("business_number");

-- CreateIndex
CREATE INDEX "Supplier_status_idx" ON "Supplier"("status");

-- CreateIndex
CREATE INDEX "ClinicSupplierLink_tenant_id_idx" ON "ClinicSupplierLink"("tenant_id");

-- CreateIndex
CREATE INDEX "ClinicSupplierLink_supplier_manager_id_idx" ON "ClinicSupplierLink"("supplier_manager_id");

-- CreateIndex
CREATE INDEX "ClinicSupplierLink_status_idx" ON "ClinicSupplierLink"("status");

-- CreateIndex
CREATE INDEX "ClinicSupplierLink_tenant_id_status_idx" ON "ClinicSupplierLink"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicSupplierLink_tenant_id_supplier_manager_id_key" ON "ClinicSupplierLink"("tenant_id", "supplier_manager_id");

-- CreateIndex
CREATE INDEX "ClinicSupplierManager_supplier_id_idx" ON "ClinicSupplierManager"("supplier_id");

-- CreateIndex
CREATE INDEX "ClinicSupplierManager_tenant_id_idx" ON "ClinicSupplierManager"("tenant_id");

-- CreateIndex
CREATE INDEX "ClinicSupplierManager_phone_number_idx" ON "ClinicSupplierManager"("phone_number");

-- CreateIndex
CREATE INDEX "ClinicSupplierManager_tenant_id_phone_number_idx" ON "ClinicSupplierManager"("tenant_id", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierManager_manager_id_key" ON "SupplierManager"("manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierManager_phone_number_key" ON "SupplierManager"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierManager_clinic_manager_id_key" ON "SupplierManager"("clinic_manager_id");

-- CreateIndex
CREATE INDEX "SupplierManager_supplier_tenant_id_idx" ON "SupplierManager"("supplier_tenant_id");

-- CreateIndex
CREATE INDEX "SupplierManager_manager_id_idx" ON "SupplierManager"("manager_id");

-- CreateIndex
CREATE INDEX "SupplierManager_phone_number_idx" ON "SupplierManager"("phone_number");

-- CreateIndex
CREATE INDEX "SupplierManager_email1_idx" ON "SupplierManager"("email1");

-- CreateIndex
CREATE INDEX "SupplierManager_status_idx" ON "SupplierManager"("status");

-- CreateIndex
CREATE INDEX "SupplierManager_clinic_manager_id_idx" ON "SupplierManager"("clinic_manager_id");

-- CreateIndex
CREATE INDEX "SupplierManager_created_by_idx" ON "SupplierManager"("created_by");

-- CreateIndex
CREATE INDEX "SupplierReturnNotification_supplier_manager_id_idx" ON "SupplierReturnNotification"("supplier_manager_id");

-- CreateIndex
CREATE INDEX "SupplierReturnNotification_return_id_idx" ON "SupplierReturnNotification"("return_id");

-- CreateIndex
CREATE INDEX "SupplierReturnNotification_clinic_tenant_id_idx" ON "SupplierReturnNotification"("clinic_tenant_id");

-- CreateIndex
CREATE INDEX "SupplierReturnNotification_status_idx" ON "SupplierReturnNotification"("status");

-- CreateIndex
CREATE INDEX "SupplierReturnNotification_is_read_idx" ON "SupplierReturnNotification"("is_read");

-- CreateIndex
CREATE INDEX "SupplierReturnNotification_supplier_manager_id_status_idx" ON "SupplierReturnNotification"("supplier_manager_id", "status");

-- CreateIndex
CREATE INDEX "SupplierReturnNotification_supplier_manager_id_is_read_idx" ON "SupplierReturnNotification"("supplier_manager_id", "is_read");

-- CreateIndex
CREATE INDEX "SupplierReturnNotification_created_at_idx" ON "SupplierReturnNotification"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOrder_order_no_key" ON "SupplierOrder"("order_no");

-- CreateIndex
CREATE INDEX "SupplierOrder_clinic_tenant_idx" ON "SupplierOrder"("clinic_tenant_id");

-- CreateIndex
CREATE INDEX "SupplierOrder_order_date_idx" ON "SupplierOrder"("order_date");

-- CreateIndex
CREATE INDEX "SupplierOrder_status_idx" ON "SupplierOrder"("status");

-- CreateIndex
CREATE INDEX "SupplierOrder_supplier_manager_idx" ON "SupplierOrder"("supplier_manager_id");

-- CreateIndex
CREATE INDEX "SupplierOrder_supplier_tenant_idx" ON "SupplierOrder"("supplier_tenant_id");

-- CreateIndex
CREATE INDEX "SupplierOrderItem_order_id_idx" ON "SupplierOrderItem"("order_id");

-- CreateIndex
CREATE INDEX "SupplierOrderItem_product_id_idx" ON "SupplierOrderItem"("product_id");

-- AddForeignKey
ALTER TABLE "ReturnPolicy" ADD CONSTRAINT "ReturnPolicy_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageItem" ADD CONSTRAINT "PackageItem_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageItem" ADD CONSTRAINT "PackageItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_outbound_id_fkey" FOREIGN KEY ("outbound_id") REFERENCES "Outbound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicSupplierLink" ADD CONSTRAINT "ClinicSupplierLink_supplier_manager_id_fkey" FOREIGN KEY ("supplier_manager_id") REFERENCES "SupplierManager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicSupplierManager" ADD CONSTRAINT "ClinicSupplierManager_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierManager" ADD CONSTRAINT "SupplierManager_clinic_manager_id_fkey" FOREIGN KEY ("clinic_manager_id") REFERENCES "ClinicSupplierManager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnNotification" ADD CONSTRAINT "SupplierReturnNotification_supplier_manager_id_fkey" FOREIGN KEY ("supplier_manager_id") REFERENCES "SupplierManager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "SupplierOrder"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
