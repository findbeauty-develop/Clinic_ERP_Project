import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../node_modules/.prisma/client-backend";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma) as any;
  }

  create(data: any, tenantId: string, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).product.create({
      data: {
        ...(data as any),
        tenant_id: tenantId,
      },
      include: { returnPolicy: true },
    });
  }

  findAll(tenantId: string, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).product.findMany({
      where: { tenant_id: tenantId },
      include: { returnPolicy: true, batches: true, supplierProducts: true },
    });
  }

  findById(id: string, tenantId: string, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).product.findFirst({
      where: { id, tenant_id: tenantId },
      include: { returnPolicy: true, batches: true, supplierProducts: true },
    });
  }

  update(
    id: string,
    data: any,
    tenantId: string,
    tx?: Prisma.TransactionClient
  ) {
    return this.getClient(tx).product.update({
      where: { id, tenant_id: tenantId },
      data: data as any,
      include: { returnPolicy: true },
    });
  }

  softDelete(id: string, tenantId: string, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).product.update({
      where: { id, tenant_id: tenantId },
      data: { is_active: false } as any,
      include: { returnPolicy: true },
    });
  }
}
