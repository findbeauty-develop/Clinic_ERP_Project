import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";
import { Prisma } from "@prisma/client";

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

      // 1. Product'ning barcha SupplierProduct'larini olish
      const supplierProducts = await (prisma as any).supplierProduct.findMany({
        where: {
          product_id: returnRecord.product_id,
        },
      });

      if (!supplierProducts || supplierProducts.length === 0) {
        this.logger.log(
          `No suppliers found for product ${returnRecord.product_id}, skipping notification creation`
        );
        return;
      }

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

      // 3. Har bir supplier uchun notification yaratish
      for (const supplierProduct of supplierProducts) {
        if (!supplierProduct.supplier_id) {
          continue;
        }

        // 4. Supplier'ni topish
        const supplier = await (prisma as any).supplier.findFirst({
          where: {
            id: supplierProduct.supplier_id,
          },
        });

        if (!supplier) {
          this.logger.warn(
            `Supplier not found: ${supplierProduct.supplier_id}`
          );
          continue;
        }

        // 5. Supplier'ning barcha ACTIVE SupplierManager'larini topish
        const supplierManagers = await (prisma as any).supplierManager.findMany({
          where: {
            supplier_id: supplier.id,
            status: "ACTIVE",
          },
        });

        if (!supplierManagers || supplierManagers.length === 0) {
          this.logger.log(
            `No active managers found for supplier ${supplier.id}, skipping notification`
          );
          continue;
        }

        // 6. Har bir SupplierManager uchun notification yaratish
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

            this.logger.log(
              `Created return notification for supplier manager ${manager.id} (${manager.name}) for return ${returnRecord.id}`
            );
          } catch (error: any) {
            this.logger.error(
              `Failed to create notification for manager ${manager.id}: ${error.message}`,
              error.stack
            );
            // Continue with other managers even if one fails
          }
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

