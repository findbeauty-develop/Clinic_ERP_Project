-- NotificationType: manual return flow (ReturnSupplierNotifiedListener) — schema.prisma bilan mos
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RETURN_SUPPLIER_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RETURN_SUPPLIER_REJECTED';
