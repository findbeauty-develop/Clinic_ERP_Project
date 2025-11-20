import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  // Order CRUD
  create(data: any, tenantId: string, tx?: Prisma.TransactionClient) {
    return (this.getClient(tx) as any).order.create({
      data: {
        ...data,
        tenant_id: tenantId,
      },
      include: {
        items: {
          include: {
            product: true,
            batch: true,
          },
        },
      },
    });
  }

  findById(id: string, tenantId: string, tx?: Prisma.TransactionClient) {
    return (this.getClient(tx) as any).order.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        items: {
          include: {
            product: true,
            batch: true,
          },
        },
      },
    });
  }

  findByOrderNo(orderNo: string, tenantId: string, tx?: Prisma.TransactionClient) {
    return (this.getClient(tx) as any).order.findFirst({
      where: { order_no: orderNo, tenant_id: tenantId },
      include: {
        items: {
          include: {
            product: true,
            batch: true,
          },
        },
      },
    });
  }

  findAll(tenantId: string, tx?: Prisma.TransactionClient) {
    return (this.getClient(tx) as any).order.findMany({
      where: { tenant_id: tenantId },
      include: {
        items: {
          include: {
            product: true,
            batch: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });
  }

  // OrderDraft CRUD
  findDraftBySession(sessionId: string, tenantId: string, tx?: Prisma.TransactionClient) {
    return (this.getClient(tx) as any).orderDraft.findUnique({
      where: {
        tenant_id_session_id: {
          tenant_id: tenantId,
          session_id: sessionId,
        },
      },
    });
  }

  createOrUpdateDraft(
    sessionId: string,
    tenantId: string,
    data: { items: any; total_amount: number },
    expiresAt: Date,
    tx?: Prisma.TransactionClient
  ) {
    return (this.getClient(tx) as any).orderDraft.upsert({
      where: {
        tenant_id_session_id: {
          tenant_id: tenantId,
          session_id: sessionId,
        },
      },
      create: {
        tenant_id: tenantId,
        session_id: sessionId,
        items: data.items,
        total_amount: data.total_amount,
        expires_at: expiresAt,
      },
      update: {
        items: data.items,
        total_amount: data.total_amount,
        updated_at: new Date(),
        expires_at: expiresAt,
      },
    });
  }

  deleteDraft(sessionId: string, tenantId: string, tx?: Prisma.TransactionClient) {
    return (this.getClient(tx) as any).orderDraft.delete({
      where: {
        tenant_id_session_id: {
          tenant_id: tenantId,
          session_id: sessionId,
        },
      },
    });
  }

  deleteExpiredDrafts(tx?: Prisma.TransactionClient) {
    return (this.getClient(tx) as any).orderDraft.deleteMany({
      where: {
        expires_at: {
          lt: new Date(),
        },
      },
    });
  }
}

