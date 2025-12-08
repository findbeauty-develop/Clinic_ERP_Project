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
      return (this.prisma as any).orderReturn.findMany({
        where,
        orderBy: { created_at: "desc" },
      });
    });
  }

  async createFromInbound(tenantId: string, dto: any) {
    const { orderId, orderNo, items } = dto;

    if (!items || items.length === 0) {
      return { message: "No returns to create" };
    }

    // Get supplier_id from order
    const order = await (this.prisma as any).order.findFirst({
      where: { id: orderId, tenant_id: tenantId },
      select: { supplier_id: true },
    });

    const returns = await Promise.all(
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

    return { created: returns.length, returns };
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

