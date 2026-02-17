import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../node_modules/.prisma/client-backend";
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
              select: {
                id: true,
                name: true,
                brand: true,
                unit: true,
                capacity_unit: true, // ✅ capacity_unit qo'shildi
                // Only fetch necessary batch fields for outbound page
                batches: {
                  select: {
                    id: true,
                    batch_no: true,
                    qty: true,
                    expiry_date: true,
                    storage: true,
                  },
                  where: {
                    qty: { gt: 0 }, // Only batches with stock > 0
                  },
                },
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

  findByName(name: string, tenantId: string, tx?: Prisma.TransactionClient) {
    const client = this.getClient(tx) as any;
    return client.package.findFirst({
      where: {
        name: name,
        tenant_id: tenantId,
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
              select: {
                id: true,
                name: true,
                brand: true,
                unit: true,
                capacity_unit: true, // ✅ capacity_unit qo'shildi
                current_stock: true,
                min_stock: true,
                batches: {
                  // ✅ batches select ichida (include emas!)
                  select: {
                    id: true,
                    batch_no: true,
                    qty: true,
                    inbound_qty: true, // ✅ Add for availableQuantity calculation
                    used_count: true, // ✅ Add for availableQuantity calculation
                    // available_quantity: true, // ✅ Will be available after migration
                    expiry_date: true,
                    storage: true,
                    alert_days: true,
                  },
                  where: {
                    qty: { gt: 0 }, // Faqat stock bor batch'lar
                  },
                },
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

  update(
    id: string,
    data: any,
    tenantId: string,
    tx?: Prisma.TransactionClient
  ) {
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

  deleteItemsByPackageId(
    packageId: string,
    tenantId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = this.getClient(tx) as any;
    return client.packageItem.deleteMany({
      where: {
        package_id: packageId,
        tenant_id: tenantId,
      },
    });
  }
}
