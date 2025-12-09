import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma.service';

@Injectable()
export class RejectedOrderService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create rejected order record when user confirms rejection
   */
  async createRejectedOrder(tenantId: string, orderId: string, memberName: string) {
    if (!tenantId || !orderId || !memberName) {
      throw new BadRequestException('Tenant ID, Order ID, and Member Name are required');
    }

    // Find the order with items and supplier info
    const order = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).order.findFirst({
        where: {
          id: orderId,
          tenant_id: tenantId,
          status: 'rejected',
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  brand: true,
                },
              },
            },
          },
        },
      });
    });

    if (!order) {
      throw new NotFoundException(`Rejected order ${orderId} not found`);
    }

    // Get supplier info
    let companyName = '알 수 없음';
    let managerName = '알 수 없음';
    
    if (order.supplier_id) {
      const supplier = await this.prisma.executeWithRetry(async () => {
        return await (this.prisma as any).supplier.findUnique({
          where: { id: order.supplier_id },
          include: {
            managers: {
              where: { status: 'ACTIVE' },
              take: 1,
            },
          },
        });
      });

      if (supplier) {
        companyName = supplier.company_name || '알 수 없음';
        managerName = supplier.managers?.[0]?.name || '알 수 없음';
      }
    }

    // Create RejectedOrder record for each item
    const rejectedOrders = [];
    for (const item of order.items) {
      const rejectedOrder = await this.prisma.executeWithRetry(async () => {
        return await (this.prisma as any).rejectedOrder.create({
          data: {
            tenant_id: tenantId,
            order_id: orderId,
            order_no: order.order_no,
            company_name: companyName,
            manager_name: managerName,
            product_name: item.product?.name || '알 수 없음',
            product_brand: item.product?.brand || null,
            qty: item.quantity,
            member_name: memberName,
          },
        });
      });
      rejectedOrders.push(rejectedOrder);
    }

    return rejectedOrders;
  }

  /**
   * Get all rejected orders for a tenant
   */
  async getRejectedOrders(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    const rejectedOrders = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).rejectedOrder.findMany({
        where: {
          tenant_id: tenantId,
        },
        orderBy: {
          created_at: 'desc',
        },
      });
    });

    return rejectedOrders;
  }

  /**
   * Check if an order has been checked (has RejectedOrder records)
   */
  async isOrderChecked(tenantId: string, orderId: string): Promise<boolean> {
    const count = await this.prisma.executeWithRetry(async () => {
      return await (this.prisma as any).rejectedOrder.count({
        where: {
          tenant_id: tenantId,
          order_id: orderId,
        },
      });
    });

    return count > 0;
  }
}

