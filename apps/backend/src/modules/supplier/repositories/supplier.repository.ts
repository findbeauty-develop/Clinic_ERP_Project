import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class SupplierRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Primary search: companyName + supplierName (manager name)
   * STRICT RULE: Only returns suppliers that have APPROVED trade relationship (ClinicSupplierLink) with the tenant
   *
   * Logic:
   * - If no APPROVED ClinicSupplierLink exists → return empty array (no results)
   * - If APPROVED link exists → filter suppliers by companyName and managerName
   * - This ensures suppliers without trade relationship don't appear in primary search
   *
   * IMPORTANT: ClinicSupplierLink now links to SupplierManager, not Supplier
   * - One Supplier can have multiple SupplierManagers
   * - Each SupplierManager can have separate trade relationships with clinics
   */
  async searchSuppliers(
    tenantId: string,
    companyName?: string,
    phoneNumber?: string,
    managerName?: string
  ) {
    const prisma = this.prisma as any;

    // ✅ NEW SIMPLIFIED LOGIC: Search directly from ClinicSupplierManager table
    // This table contains all clinic-specific supplier data
    
    // Build where clause for ClinicSupplierManager
    const where: any = {
      tenant_id: tenantId,
    };

    // Add filters based on search criteria
    if (companyName) {
      where.company_name = {
        contains: companyName,
        mode: "insensitive",
      };
    }

    if (managerName) {
      where.name = {
        contains: managerName,
        mode: "insensitive",
      };
    }

    if (phoneNumber) {
      where.phone_number = {
        contains: phoneNumber,
        mode: "insensitive",
      };
    }

    // Query ClinicSupplierManager directly
    return prisma.clinicSupplierManager.findMany({
      where,
      select: {
        id: true,
        company_name: true,
        name: true,
        position: true,
        phone_number: true,
        email1: true,
        email2: true,
        company_address: true,
        business_number: true,
        company_phone: true,
        company_email: true,
        responsible_products: true,
        created_at: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });
  }

  /**
   * Fallback search by phone number - finds suppliers registered on platform OR created by clinic
   * Used when primary search (companyName + managerName) returns no results
   *
   * Searches:
   * 1. SupplierManager (self-registered suppliers, status = ACTIVE)
   * 2. ClinicSupplierManager (clinic-created suppliers for this tenant)
   *
   * When clinic finds a supplier and approves, ClinicSupplierLink is created
   */
  async searchSuppliersByPhone(phoneNumber: string, tenantId?: string) {
    const prisma = this.prisma as any;

    if (!phoneNumber) {
      return [];
    }

    // Clean phone number: remove spaces, dashes, parentheses for better matching
    const cleanPhoneNumber = phoneNumber.replace(/[\s\-\(\)]/g, "").trim();

    if (!cleanPhoneNumber) {
      return [];
    }

    const supplierIds = new Set<string>();

    // 1. Search in SupplierManager (self-registered suppliers)
    const supplierManagers = await prisma.supplierManager.findMany({
      where: {
        OR: [
          {
            phone_number: {
              contains: phoneNumber,
              mode: "insensitive",
            },
          },
          {
            phone_number: {
              contains: cleanPhoneNumber,
              mode: "insensitive",
            },
          },
        ],
        status: "ACTIVE", // Only active managers
      },
      include: {
        supplier: true,
      },
    });

    // Collect supplier IDs from SupplierManager
    supplierManagers.forEach((m: any) => {
      if (
        m.supplier &&
        (m.supplier.status === "ACTIVE" || m.supplier.status === "MANUAL_ONLY")
      ) {
        supplierIds.add(m.supplier.id);
      }
    });

    // 2. Search in ClinicSupplierManager (clinic-created suppliers) if tenantId provided
    let clinicManagersWithoutLink: any[] = [];
    if (tenantId) {
      const clinicManagers = await prisma.clinicSupplierManager.findMany({
        where: {
          tenant_id: tenantId, // Only this clinic's managers
          OR: [
            {
              phone_number: {
                contains: phoneNumber,
                mode: "insensitive",
              },
            },
            {
              phone_number: {
                contains: cleanPhoneNumber,
                mode: "insensitive",
              },
            },
          ],
        },
        include: {
          linkedManager: true, // Check if linked to SupplierManager
          productSuppliers: {
            take: 1, // Just to check if this supplier has products
          },
        },
      });

      // Collect supplier IDs from ClinicSupplierManager via linkedManager
      clinicManagers.forEach((cm: any) => {
        if (cm.linkedManager && cm.linkedManager.supplier_id) {
          supplierIds.add(cm.linkedManager.supplier_id);
        } else {
          // ✅ Agar linkedManager yo'q bo'lsa, ClinicSupplierManager'ni saqlash
          clinicManagersWithoutLink.push(cm);
        }
      });
    }

    // Return suppliers from Supplier table (platform-registered suppliers)
    const suppliersFromPlatform =
      supplierIds.size > 0
        ? await prisma.supplier.findMany({
            where: {
              id: {
                in: Array.from(supplierIds),
              },
            },
            include: {
              managers: {
                where: {
                  OR: [
                    {
                      phone_number: {
                        contains: phoneNumber,
                        mode: "insensitive",
                      },
                    },
                    {
                      phone_number: {
                        contains: cleanPhoneNumber,
                        mode: "insensitive",
                      },
                    },
                  ],
                  status: "ACTIVE",
                },
                select: {
                  id: true,
                  manager_id: true,
                  name: true,
                  position: true,
                  phone_number: true,
                  email1: true,
                  manager_address: true,
                  responsible_products: true,
                  status: true,
                },
              },
            },
            orderBy: {
              created_at: "desc",
            },
          })
        : [];

    // ✅ ClinicSupplierManager ma'lumotlarini Supplier format'iga o'girish
    const clinicSuppliers = clinicManagersWithoutLink.map((cm: any) => ({
      id: cm.id, // ClinicSupplierManager ID (temporary, will be used as identifier)
      company_name: cm.company_name,
      company_address: cm.company_address,
      business_number: cm.business_number,
      company_phone: cm.company_phone,
      company_email: cm.company_email,
      business_type: cm.business_type || null,
      business_item: cm.business_item || null,
      product_categories: [],
      status: "MANUAL_ONLY", // Clinic yaratgan supplier
      created_at: cm.created_at,
      updated_at: cm.updated_at,
      // ✅ ClinicSupplierManager'ni manager sifatida qo'shish
      managers: [
        {
          id: cm.id, // ClinicSupplierManager ID
          manager_id: null, // ClinicSupplierManager'da manager_id yo'q
          name: cm.name,
          position: cm.position,
          phone_number: cm.phone_number,
          email1: cm.email1,
          email2: cm.email2,
          manager_address: cm.address || null,
          responsible_products: [],
          status: "ACTIVE",
        },
      ],
      // ✅ Flag: Bu ClinicSupplierManager, linkedManager yo'q
      isClinicCreated: true,
      clinicSupplierManagerId: cm.id,
      linkedManagerId: cm.linked_supplier_manager_id,
    }));

    // Barcha natijalarni birlashtirish
    return [...suppliersFromPlatform, ...clinicSuppliers];
  }

  /**
   * List all approved suppliers for a tenant
   * Returns all suppliers that have APPROVED ClinicSupplierLink with all their managers
   */
  async listAllApprovedSuppliers(tenantId: string) {
    const prisma = this.prisma as any;

    // Get SupplierManager IDs that have APPROVED trade relationship
    const approvedLinks = await prisma.clinicSupplierLink.findMany({
      where: {
        tenant_id: tenantId,
        status: "APPROVED",
      },
      select: {
        supplier_manager_id: true,
      },
    });

    const approvedManagerIds = new Set<string>();
    approvedLinks.forEach((link: any) => {
      approvedManagerIds.add(link.supplier_manager_id);
    });

    if (approvedManagerIds.size === 0) {
      return [];
    }

    // Get unique supplier IDs from approved managers
    const approvedManagers = await prisma.supplierManager.findMany({
      where: {
        id: {
          in: Array.from(approvedManagerIds),
        },
      },
      select: {
        supplier_tenant_id: true,
      },
    });

    const supplierIds = new Set<string>();
    approvedManagers.forEach((manager: any) => {
      supplierIds.add(manager.supplier_tenant_id);
    });

    if (supplierIds.size === 0) {
      return [];
    }

    // Return suppliers with all their managers
    return prisma.supplier.findMany({
      where: {
        tenant_id: {
          in: Array.from(supplierIds),
        },
      },
      include: {
        managers: {
          select: {
            id: true,
            manager_id: true,
            name: true,
            position: true,
            phone_number: true,
            email1: true,
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
   * Create or get ClinicSupplierLink
   * Creates a REQUESTED link, or returns existing link
   * IMPORTANT: Now works with SupplierManager ID, not Supplier ID
   */
  async createOrGetTradeLink(tenantId: string, supplierManagerId: string) {
    const prisma = this.prisma as any;

    return prisma.clinicSupplierLink.upsert({
      where: {
        tenant_id_supplier_manager_id: {
          tenant_id: tenantId,
          supplier_manager_id: supplierManagerId,
        },
      },
      update: {
        // If link exists but was BLOCKED, reset to REQUESTED
        status: "REQUESTED",
        requested_at: new Date(),
        updated_at: new Date(),
      },
      create: {
        tenant_id: tenantId,
        supplier_manager_id: supplierManagerId,
        status: "REQUESTED",
      },
    });
  }

  /**
   * Approve trade relationship
   * Creates APPROVED link if it doesn't exist, or updates existing link to APPROVED
   * IMPORTANT: Now works with SupplierManager ID, not Supplier ID
   */
  async approveTradeLink(tenantId: string, supplierManagerId: string) {
    const prisma = this.prisma as any;

    // Upsert: Create APPROVED link if it doesn't exist, or update existing link to APPROVED
    return prisma.clinicSupplierLink.upsert({
      where: {
        tenant_id_supplier_manager_id: {
          tenant_id: tenantId,
          supplier_manager_id: supplierManagerId,
        },
      },
      update: {
        status: "APPROVED",
        approved_at: new Date(),
        updated_at: new Date(),
      },
      create: {
        tenant_id: tenantId,
        supplier_manager_id: supplierManagerId,
        status: "APPROVED",
        approved_at: new Date(),
      },
    });
  }

  /**
   * Block trade relationship
   * IMPORTANT: Now works with SupplierManager ID, not Supplier ID
   */
  async blockTradeLink(tenantId: string, supplierManagerId: string) {
    const prisma = this.prisma as any;

    return prisma.clinicSupplierLink.update({
      where: {
        tenant_id_supplier_manager_id: {
          tenant_id: tenantId,
          supplier_manager_id: supplierManagerId,
        },
      },
      data: {
        status: "BLOCKED",
        blocked_at: new Date(),
        updated_at: new Date(),
      },
    });
  }
}
