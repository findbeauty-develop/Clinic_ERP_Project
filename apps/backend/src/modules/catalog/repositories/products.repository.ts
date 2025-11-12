import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class ProductsRepository {
  constructor(private prisma: PrismaService) {}

  create(data: any) {
    return this.prisma.product.create({ data });
  }

  findMany(tenantId: string) {
    return this.prisma.product.findMany({
      where: { tenant_id: tenantId, is_deleted: false },
    });
  }

  update(id: string, data: any) {
    return this.prisma.product.update({ where: { id }, data });
  }

  softDelete(id: string) {
    return this.prisma.product.update({
      where: { id },
      data: { is_deleted: true },
    });
  }
}

