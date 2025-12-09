import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";

@Injectable()
export class OrderReturnService {
  constructor(private readonly prisma: PrismaService) {}

  async getReturns(tenantId: string, status?: string) {
    const where: any = { tenant_id: tenantId };
    if (status) {
      where.status = status;
    }

    return this.prisma.executeWithRetry(async () => {
      const returns = await (this.prisma as any).orderReturn.findMany({
        where,
        orderBy: { created_at: "desc" },
      });

      // Fetch supplier information for each return
      const returnsWithSupplier = await Promise.all(
        returns.map(async (returnItem: any) => {
          let supplierName = "알 수 없음";
          let managerName = "";

          if (returnItem.supplier_id) {
            const supplier = await (this.prisma as any).supplier.findUnique({
              where: { id: returnItem.supplier_id },
              include: {
                managers: {
                  where: { status: "ACTIVE" },
                  take: 1,
                  orderBy: { created_at: "asc" },
                },
                clinicManagers: {
                  where: { tenant_id: tenantId },
                  take: 1,
                  orderBy: { created_at: "asc" },
                },
              },
            });

            if (supplier) {
              supplierName = supplier.company_name || "알 수 없음";
              const manager = supplier.managers?.[0] || supplier.clinicManagers?.[0];
              managerName = manager?.name || "";
            }
          }

          return {
            ...returnItem,
            supplierName,
            managerName,
          };
        })
      );

      return returnsWithSupplier;
    });
  }

  async createFromInbound(tenantId: string, dto: any) {
    const { orderId, orderNo, items } = dto;

    if (!items || items.length === 0) {
      return { message: "No returns to create" };
    }

    if (!orderId || !orderNo) {
      throw new BadRequestException("orderId and orderNo are required");
    }

    try {
      // Get supplier_id from order
      const order = await this.prisma.executeWithRetry(async () => {
        return (this.prisma as any).order.findFirst({
          where: { id: orderId, tenant_id: tenantId },
          select: { supplier_id: true },
        });
      });

      const returns = await this.prisma.executeWithRetry(async () => {
        return Promise.all(
          items.map((item: any) =>
            (this.prisma as any).orderReturn.create({
              data: {
                tenant_id: tenantId,
                order_id: orderId,
                order_no: orderNo,
                batch_no: item.batchNo,
                product_id: item.productId,
                product_name: item.productName,
                brand: item.brand || null,
                return_quantity: item.returnQuantity,
                total_quantity: item.totalQuantity,
                unit_price: item.unitPrice,
                return_type: "주문|반품",
                status: "pending",
                supplier_id: order?.supplier_id || null,
              },
            })
          )
        );
      });

      return { created: returns.length, returns };
    } catch (error: any) {
      console.error(`❌ Error creating returns:`, error);
      throw new BadRequestException(
        `Failed to create returns: ${error?.message || "Unknown error"}`
      );
    }
  }

  async processReturn(tenantId: string, id: string, dto: any) {
    // Will implement: update status, add manager, memo, images
    return this.prisma.executeWithRetry(async () => {
      return (this.prisma as any).orderReturn.update({
        where: { id },
        data: {
          status: "completed",
          return_manager: dto.returnManager || null,
          memo: dto.memo || null,
          images: dto.images || [],
          updated_at: new Date(),
        },
      });
    });
  }
}

