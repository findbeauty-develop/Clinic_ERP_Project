import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";
import { Prisma } from "../../../../node_modules/.prisma/client-backend";

@Injectable()
export class SupplierReturnNotificationService {
  private readonly logger = new Logger(SupplierReturnNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return yaratilganda supplier manager'larga notification yaratish
   */
  async createNotificationsForReturn(
    returnRecord: any,
    product: any,
    tenantId: string
  ): Promise<void> {
    try {
      const prisma = this.prisma;

      // 1. Product'ning ProductSupplier mappingini olish
      const productSupplier = await (prisma as any).productSupplier.findUnique({
        where: {
          product_id: returnRecord.product_id,
        },
        include: {
          clinicSupplierManager: {
            include: {
              linkedManager: true,
            },
          },
        },
      });

      // 2. Clinic nomini olish
      const clinic = await (prisma as any).clinic.findFirst({
        where: {
          tenant_id: tenantId,
        },
        select: {
          name: true,
        },
      });

      const clinicName = clinic?.name || `Clinic-${tenantId}`;

      // 3. Check if linked to platform supplier
      const clinicSupplierManager = productSupplier.clinicSupplierManager;
      const linkedManager = clinicSupplierManager.linkedManager;

      // 4. Find supplier via linkedManager
      const supplier = await (prisma as any).supplier.findFirst({
        where: {
          tenant_id: linkedManager.supplier_tenant_id,
        },
      });

      if (!supplier) {
        this.logger.warn(`Supplier not found for manager ${linkedManager.id}`);
        return;
      }

      // 5. Get all ACTIVE SupplierManagers for this supplier
      const supplierManagers = await (prisma as any).supplierManager.findMany({
        where: {
          supplier_tenant_id: supplier.tenant_id,
          status: "ACTIVE",
        },
      });

      if (!supplierManagers || supplierManagers.length === 0) {
        return;
      }

      // 6. Create notification for each SupplierManager
      for (const manager of supplierManagers) {
        try {
          await (prisma as any).supplierReturnNotification.create({
            data: {
              supplier_manager_id: manager.id,
              return_id: returnRecord.id,
              clinic_tenant_id: tenantId,
              clinic_name: clinicName,
              product_id: product.id,
              product_name: product.name,
              product_brand: product.brand,
              product_code: product.barcode || null,
              return_qty: returnRecord.return_qty,
              refund_amount_per_item: returnRecord.refund_amount,
              total_refund: returnRecord.total_refund,
              return_manager_name: returnRecord.manager_name,
              return_date: returnRecord.return_date,
              batch_no: returnRecord.batch_no || null,
              status: "PENDING",
              is_read: false,
            },
          });
        } catch (error: any) {
          this.logger.error(
            `Failed to create notification for manager ${manager.id}: ${error.message}`,
            error.stack
          );
          // Continue with other managers even if one fails
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Error creating supplier return notifications: ${error.message}`,
        error.stack
      );
      // Don't throw - notification creation failure shouldn't break return process
    }
  }
}
