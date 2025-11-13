import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  create(data: any, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).product.create({
      data: data as any,
      include: { returnPolicy: true },
    });
  }

  findAll(tx?: Prisma.TransactionClient) {
    return this.getClient(tx).product.findMany({
      include: { returnPolicy: true },
    });
  }

  findById(id: string, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).product.findUnique({
      where: { id },
      include: { returnPolicy: true },
    });
  }

  update(id: string, data: any, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).product.update({
      where: { id },
      data: data as any,
      include: { returnPolicy: true },
    });
  }

  softDelete(id: string, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).product.update({
      where: { id },
      data: { is_active: false } as any,
      include: { returnPolicy: true },
    });
  }
}