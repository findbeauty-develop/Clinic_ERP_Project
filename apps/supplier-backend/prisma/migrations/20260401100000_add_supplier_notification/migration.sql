CREATE TABLE IF NOT EXISTS "SupplierNotification" (
  "id"                  TEXT NOT NULL,
  "supplier_manager_id" TEXT NOT NULL,
  "type"                TEXT NOT NULL,
  "title"               TEXT NOT NULL,
  "body"                TEXT NOT NULL,
  "entity_type"         TEXT NOT NULL DEFAULT 'order',
  "entity_id"           TEXT,
  "payload"             JSONB,
  "read_at"             TIMESTAMP(3),
  "dedupe_key"          TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3),

  CONSTRAINT "SupplierNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierNotification_dedupe_key_key" ON "SupplierNotification"("dedupe_key");
CREATE INDEX IF NOT EXISTS "SupplierNotification_supplier_manager_id_idx" ON "SupplierNotification"("supplier_manager_id");
CREATE INDEX IF NOT EXISTS "SupplierNotification_supplier_manager_id_read_at_idx" ON "SupplierNotification"("supplier_manager_id", "read_at");
