-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER_SUPPLIER_CONFIRMED', 'ORDER_SUPPLIER_REJECTED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "recipient_member_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" JSONB,
    "dedupe_key" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_tenant_id_recipient_member_id_read_at_idx" ON "notifications"("tenant_id", "recipient_member_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_member_id_created_at_idx" ON "notifications"("recipient_member_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_recipient_member_id_dedupe_key_key" ON "notifications"("recipient_member_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_member_id_fkey" FOREIGN KEY ("recipient_member_id") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
