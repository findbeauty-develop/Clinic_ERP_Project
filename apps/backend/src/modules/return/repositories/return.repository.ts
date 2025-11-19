import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
            },
          },
        },
        orderBy: { return_date: "desc" },
        skip,
        take: limit,
      }),
      (this.prisma as any).return.count({ where }),
    ]);

    return {
      items: returns,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

