import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class SupplierRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search suppliers with transaction history filter
   * Only returns suppliers that have at least one transaction (Order, Return, or SupplierProduct) with the tenant
   */
  async searchSuppliers(
    tenantId: string,
    companyName?: string,
    phoneNumber?: string,
    managerName?: string
  ) {
    const prisma = this.prisma as any;

    // Get supplier IDs that have transaction history with this tenant
    const [orderSupplierIds, returnSupplierIds, supplierProductSupplierIds] = await Promise.all([
      // Suppliers with Orders
      prisma.order.findMany({
        where: {
          tenant_id: tenantId,
          supplier_id: { not: null },
        },
        select: {
          supplier_id: true,
        },
      }),
      // Suppliers with Returns
      prisma.return.findMany({
        where: {
          tenant_id: tenantId,
          supplier_id: { not: null },
        },
        select: {
          supplier_id: true,
        },
      }),
      // Suppliers with SupplierProduct
      prisma.supplierProduct.findMany({
        where: {
          tenant_id: tenantId,
        },
        select: {
          supplier_id: true,
        },
      }),
    ]);

    // Combine all supplier IDs with transaction history (deduplicate using Set)
    const supplierIdsWithHistory = new Set<string>();
    orderSupplierIds.forEach((o: any) => {
      if (o.supplier_id) supplierIdsWithHistory.add(o.supplier_id);
    });
    returnSupplierIds.forEach((r: any) => {
      if (r.supplier_id) supplierIdsWithHistory.add(r.supplier_id);
    });
    supplierProductSupplierIds.forEach((sp: any) => {
      if (sp.supplier_id) supplierIdsWithHistory.add(sp.supplier_id);
    });

    // If searching by phone number or manager name only, find manager first, then get supplier
    if ((phoneNumber || managerName) && !companyName) {
      const managerWhere: any = {};
      
      if (phoneNumber) {
        managerWhere.phone_number = {
          contains: phoneNumber,
          mode: "insensitive",
        };
      }
      
      if (managerName) {
        managerWhere.name = {
          contains: managerName,
          mode: "insensitive",
        };
      }

      const managers = await prisma.supplierManager.findMany({
        where: managerWhere,
        include: {
          supplier: true,
        },
      });

      // Get unique suppliers from managers that have transaction history
      const supplierIds = [...new Set(managers.map((m: any) => m.supplier_id))]
        .filter((id: any): id is string => typeof id === 'string' && supplierIdsWithHistory.has(id));

      if (supplierIds.length === 0) {
        return [];
      }

      return prisma.supplier.findMany({
        where: {
          id: {
            in: supplierIds,
          },
        },
        include: {
          managers: {
            where: (() => {
              const where: any = {};
              if (phoneNumber) {
                where.phone_number = {
                  contains: phoneNumber,
                  mode: "insensitive",
                };
              }
              if (managerName) {
                where.name = {
                  contains: managerName,
                  mode: "insensitive",
                };
              }
              return Object.keys(where).length > 0 ? where : undefined;
            })(),
            select: {
              id: true,
              manager_id: true,
              name: true,
              position: true,
              phone_number: true,
              email1: true,
              email2: true,
              responsible_products: true,
              status: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });
    }

    // Build where clause for company name search
    const where: any = {
      id: {
        in: Array.from(supplierIdsWithHistory),
      },
    };

    if (companyName) {
      where.company_name = {
        contains: companyName,
        mode: "insensitive",
      };
    }

    // Add manager filters if company name is also provided
    if ((phoneNumber || managerName) && companyName) {
      const managerConditions: any[] = [];
      
      if (phoneNumber) {
        managerConditions.push({
          phone_number: {
            contains: phoneNumber,
            mode: "insensitive",
          },
        });
      }
      
      if (managerName) {
        managerConditions.push({
          name: {
            contains: managerName,
            mode: "insensitive",
          },
        });
      }

      where.managers = {
        some: managerConditions.length === 1 
          ? managerConditions[0]
          : {
              AND: managerConditions,
            },
      };
    }

    return prisma.supplier.findMany({
      where,
      include: {
        managers: {
          where: (() => {
            const where: any = {};
            if (phoneNumber) {
              where.phone_number = {
                contains: phoneNumber,
                mode: "insensitive",
              };
            }
            if (managerName) {
              where.name = {
                contains: managerName,
                mode: "insensitive",
              };
            }
            return Object.keys(where).length > 0 ? where : undefined;
          })(),
          select: {
            id: true,
            manager_id: true,
            name: true,
            position: true,
            phone_number: true,
            email1: true,
            email2: true,
            responsible_products: true,
            status: true,
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });
  }

  /**
   * Fallback search by phone number without transaction history filter
   * Used when main search returns no results and we need to find registered suppliers
   */
  async searchSuppliersByPhone(phoneNumber: string) {
    const prisma = this.prisma as any;

    const managers = await prisma.supplierManager.findMany({
      where: {
        phone_number: {
          contains: phoneNumber,
          mode: "insensitive",
        },
      },
      include: {
        supplier: true,
      },
    });

    // Get unique suppliers from managers
    const supplierIds = [...new Set(managers.map((m: any) => m.supplier_id))];

    if (supplierIds.length === 0) {
      return [];
    }

    return prisma.supplier.findMany({
      where: {
        id: {
          in: supplierIds,
        },
      },
      include: {
        managers: {
          where: {
            phone_number: {
              contains: phoneNumber,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
            manager_id: true,
            name: true,
            position: true,
            phone_number: true,
            email1: true,
            email2: true,
            responsible_products: true,
            status: true,
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });
  }
}
