import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class SupplierRepository {
  constructor(private readonly prisma: PrismaService) {}

  async searchSuppliers(companyName?: string, phoneNumber?: string, managerName?: string) {
    const prisma = this.prisma as any;

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

      // Get unique suppliers from managers
      const supplierIds = [...new Set(managers.map((m: any) => m.supplier_id))];

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
    const where: any = {};

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

