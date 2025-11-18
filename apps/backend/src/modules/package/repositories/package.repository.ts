import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class PackageRepository {
  constructor(private readonly prisma: PrismaService) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  create(data: any, tenantId: string, tx?: Prisma.TransactionClient) {
    const client = this.getClient(tx) as any;
    return client.package.create({
      data: {
        ...(data as any),
        tenant_id: tenantId,
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                batches: true,
              },
            },
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });
  }

  findAll(tenantId: string, tx?: Prisma.TransactionClient) {
    const client = this.getClient(tx) as any;
    return client.package.findMany({
      where: { tenant_id: tenantId },
      include: {
        items: {
          include: {
            product: {
              include: {
                batches: true,
              },
            },
          },
          orderBy: {
            order: "asc",
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });
  }

  findActive(tenantId: string, tx?: Prisma.TransactionClient) {
    const client = this.getClient(tx) as any;
    return client.package.findMany({
      where: { tenant_id: tenantId, is_active: true },
      include: {
        items: {
          include: {
            product: {
              include: {
                batches: true,
              },
            },
          },
          orderBy: {
            order: "asc",
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });
  }

  findById(id: string, tenantId: string, tx?: Prisma.TransactionClient) {
    const client = this.getClient(tx) as any;
    return client.package.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        items: {
          include: {
            product: {
              include: {
                batches: true,
              },
            },
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });
  }

  update(id: string, data: any, tenantId: string, tx?: Prisma.TransactionClient) {
    const client = this.getClient(tx) as any;
    return client.package.update({
      where: { id },
      data: data as any,
      include: {
        items: {
          include: {
            product: {
              include: {
                batches: true,
              },
            },
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });
  }

  delete(id: string, tenantId: string, tx?: Prisma.TransactionClient) {
    const client = this.getClient(tx) as any;
    return client.package.delete({
      where: { id },
    });
  }


  // PackageItem operations
  createItem(data: any, tenantId: string, tx?: Prisma.TransactionClient) {
    const client = this.getClient(tx) as any;
    return client.packageItem.create({
      data: {
        ...(data as any),
        tenant_id: tenantId,
      },
      include: {
        product: {
          include: {
            batches: true,
          },
        },
      },
    });
  }

  deleteItemsByPackageId(packageId: string, tenantId: string, tx?: Prisma.TransactionClient) {
    const client = this.getClient(tx) as any;
    return client.packageItem.deleteMany({
      where: {
        package_id: packageId,
        tenant_id: tenantId,
      },
    });
  }
}

