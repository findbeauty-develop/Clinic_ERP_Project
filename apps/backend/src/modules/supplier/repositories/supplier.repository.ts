import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class SupplierRepository {
  constructor(private readonly prisma: PrismaService) {}

  async searchSuppliers(companyName?: string, phoneNumber?: string) {
    const prisma = this.prisma as any;

    // If searching by phone number, find manager first, then get supplier
    if (phoneNumber && !companyName) {
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

    if (phoneNumber && companyName) {
      where.managers = {
        some: {
          phone_number: {
            contains: phoneNumber,
            mode: "insensitive",
          },
        },
      };
    }

    return prisma.supplier.findMany({
      where,
      include: {
        managers: {
          where: phoneNumber
            ? {
                phone_number: {
                  contains: phoneNumber,
                  mode: "insensitive",
                },
              }
            : undefined,
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

