import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../node_modules/.prisma/client-backend";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class ReturnRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return yozuvini yaratish
   */
  async create(
    data: {
      tenant_id: string;
      product_id: string;
      batch_id: string;
      outbound_id?: string;
      batch_no: string;
      supplier_id?: string;
      return_qty: number;
      refund_amount: number;
      total_refund: number;
      manager_name: string;
      memo?: string;
      created_by?: string;
    },
    tx?: Prisma.TransactionClient
  ) {
    const client = tx || this.prisma;
    return await (client as any).return.create({
      data: {
        tenant_id: data.tenant_id,
        product_id: data.product_id,
        batch_id: data.batch_id,
        outbound_id: data.outbound_id ?? null,
        batch_no: data.batch_no,
        supplier_id: data.supplier_id ?? null,
        return_qty: data.return_qty,
        refund_amount: data.refund_amount,
        total_refund: data.total_refund,
        manager_name: data.manager_name,
        memo: data.memo ?? null,
        created_by: data.created_by ?? null,
      },
    });
  }

  /**
   * Product'ning qaytarilgan miqdorini olish
   */
  async getReturnedQuantity(
    productId: string,
    tenantId: string,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const client = tx || this.prisma;
    const result = await (client as any).return.aggregate({
      where: {
        product_id: productId,
        tenant_id: tenantId,
      },
      _sum: {
        return_qty: true,
      },
    });
    return result._sum?.return_qty ?? 0;
  }

  /**
   * Batch'ning qaytarilgan miqdorini olish
   */
  async getReturnedQuantityByBatch(
    batchId: string,
    tenantId: string,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const client = tx || this.prisma;
    const result = await (client as any).return.aggregate({
      where: {
        batch_id: batchId,
        tenant_id: tenantId,
      },
      _sum: {
        return_qty: true,
      },
    });
    return result._sum?.return_qty ?? 0;
  }

  /**
   * Outbound'ning qaytarilgan miqdorini olish
   */
  async getReturnedQuantityByOutbound(
    outboundId: string,
    tenantId: string,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const client = tx || this.prisma;
    const result = await (client as any).return.aggregate({
      where: {
        outbound_id: outboundId,
        tenant_id: tenantId,
      },
      _sum: {
        return_qty: true,
      },
    });
    return result._sum?.return_qty ?? 0;
  }

  /**
   * Return tarixini olish
   */
  async getReturnHistory(
    tenantId: string,
    filters?: {
      productId?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    }
  ) {
    const where: any = {
      tenant_id: tenantId,
    };

    if (filters?.productId) {
      where.product_id = filters.productId;
    }

    if (filters?.startDate || filters?.endDate) {
      where.return_date = {};
      if (filters.startDate) {
        where.return_date.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.return_date.lte = filters.endDate;
      }
    }

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 10;
    const skip = (page - 1) * limit;

    const [returns, total] = await Promise.all([
      (this.prisma as any).return.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              brand: true,
              unit: true,
              supplierProducts: {
                take: 1,
                orderBy: { created_at: "desc" },
                select: {
                  supplier_id: true,
                },
              },
            },
          },
          batch: {
            select: {
              id: true,
              batch_no: true,
            },
          },
          outbound: {
            select: {
              id: true,
              outbound_date: true,
              manager_name: true,
            },
          },
        },
        orderBy: { return_date: "desc" },
        skip,
        take: limit,
      }),
      (this.prisma as any).return.count({ where }),
    ]);

    // Fetch supplier return notifications for each return
    const returnIds = returns.map((r: any) => r.id);
    const notifications = returnIds.length > 0
      ? await (this.prisma as any).supplierReturnNotification.findMany({
          where: {
            return_id: { in: returnIds },
          },
          select: {
            return_id: true,
            status: true,
            accepted_at: true,
            created_at: true,
          },
          orderBy: { created_at: "desc" },
        })
      : [];

    // Group notifications by return_id and get the best status for each return
    // Priority: ACCEPTED > PENDING > REJECTED
    const notificationsByReturnId: Record<string, any> = {};
    notifications.forEach((notif: any) => {
      const existing = notificationsByReturnId[notif.return_id];
      
      if (!existing) {
        notificationsByReturnId[notif.return_id] = notif;
      } else {
        // Priority: ACCEPTED > PENDING > REJECTED
        const statusPriority: Record<string, number> = {
          ACCEPTED: 3,
          PENDING: 2,
          REJECTED: 1,
        };
        
        const existingPriority = statusPriority[existing.status] || 0;
        const newPriority = statusPriority[notif.status] || 0;
        
        // If new notification has higher priority, use it
        // If same priority, use the latest one
        if (newPriority > existingPriority) {
          notificationsByReturnId[notif.return_id] = notif;
        } else if (newPriority === existingPriority && 
                   new Date(notif.created_at) > new Date(existing.created_at)) {
          notificationsByReturnId[notif.return_id] = notif;
        }
      }
    });

    // Attach notification status to each return
    const returnsWithStatus = returns.map((returnItem: any) => ({
      ...returnItem,
      supplierReturnNotifications: notificationsByReturnId[returnItem.id] 
        ? [notificationsByReturnId[returnItem.id]]
        : [],
    }));

    return {
      items: returnsWithStatus,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

