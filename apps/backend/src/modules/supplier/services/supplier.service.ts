import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { SupplierRepository } from "../repositories/supplier.repository";
import { SearchSupplierDto } from "../dto/search-supplier.dto";
import { CreateSupplierManualDto } from "../dto/create-supplier-manual.dto";
import { PrismaService } from "../../../core/prisma.service";

@Injectable()
export class SupplierService {
  private readonly logger = new Logger(SupplierService.name);

  constructor(
    private readonly repository: SupplierRepository,
    private readonly prisma: PrismaService
  ) {}

  async searchSuppliers(dto: SearchSupplierDto, tenantId: string) {
    // ✅ NEW SIMPLIFIED LOGIC: Search directly from ClinicSupplierManager
    // No need to check APPROVED links or SupplierManager - all data is in one table

    // Validate that at least one search criteria is provided
    if (!dto.companyName && !dto.managerName) {
      throw new Error(
        "회사명 또는 담당자 이름 중 하나는 필수입니다."
      );
    }

    // Search ClinicSupplierManager directly
    const results = await this.repository.searchSuppliers(
      tenantId,
      dto.companyName,
      undefined, // phoneNumber is NOT allowed in primary search (use separate endpoint)
      dto.managerName
    );

    // Format response to match frontend expectations
    return results.map((manager: any) => {
      return {
        id: manager.id, // ClinicSupplierManager ID
        supplierId: manager.id, // Same as id for consistency
        companyName: manager.company_name || "",
        companyAddress: manager.company_address || null,
        businessNumber: manager.business_number || "",
        companyPhone: manager.company_phone || null,
        companyEmail: manager.company_email || "",
        managerId: manager.id, // Same as id
        managerName: manager.name || "",
        position: manager.position || null,
        phoneNumber: manager.phone_number || "",
        email1: manager.email1 || null,
        email2: manager.email2 || null,
        responsibleProducts: manager.responsible_products || [],
      };
    });
  }

  /**
   * List all approved suppliers for a tenant
   * Returns all suppliers that have APPROVED ClinicSupplierLink
   */
  async listAllSuppliers(tenantId: string) {
    const suppliers = await this.repository.listAllApprovedSuppliers(tenantId);

    // Format response same as searchSuppliers
    return suppliers.map((supplier: any) => {
      // Get all managers (both SupplierManager and ClinicSupplierManager)
      const allManagers = [
        ...(supplier.managers || []),
        ...(supplier.clinicManagers || []),
      ];

      return {
        // 회사 정보
        id: supplier.id,
        supplierId: supplier.id,
        companyName: supplier.company_name,
        companyAddress: supplier.company_address,
        businessNumber: supplier.business_number,
        companyPhone: supplier.company_phone,
        companyEmail: supplier.company_email,
        businessType: supplier.business_type,
        businessItem: supplier.business_item,
        productCategories: supplier.product_categories,
        status: supplier.status,

        // All managers (SupplierManager - global, login uchun)
        managers:
          supplier.managers?.map((m: any) => ({
            managerId: m.manager_id,
            name: m.name,
            position: m.position,
            phoneNumber: m.phone_number,
            email1: m.email1,
            email2: m.email2,
            responsibleProducts: m.responsible_products,
            status: m.status,
          })) || [],

        // Note: clinicManagers removed - no direct relation in Supplier model
      };
    });
  }

  /**
   * Fallback search by phone number
   * Searches directly from ClinicSupplierManager table
   */
  async searchSuppliersByPhone(phoneNumber: string, tenantId: string) {
    if (!phoneNumber) {
      throw new Error("핸드폰 번호는 필수입니다");
    }

    // ✅ NEW SIMPLIFIED LOGIC: Search directly from ClinicSupplierManager by phone
    const results = await this.repository.searchSuppliers(
      tenantId,
      undefined, // no companyName filter
      phoneNumber, // search by phone
      undefined // no managerName filter
    );

    // Format response to match frontend expectations
    return results.map((manager: any) => {
      return {
        id: manager.id, // ClinicSupplierManager ID
        supplierId: manager.id, // Same as id for consistency
        companyName: manager.company_name || "",
        companyAddress: manager.company_address || null,
        businessNumber: manager.business_number || "",
        companyPhone: manager.company_phone || null,
        companyEmail: manager.company_email || "",
        managerId: manager.id, // Same as id
        managerName: manager.name || "",
        position: manager.position || null,
        phoneNumber: manager.phone_number || "",
        email1: manager.email1 || null,
        email2: manager.email2 || null,
        responsibleProducts: manager.responsible_products || [],
        isRegisteredOnPlatform: false, // Not applicable anymore - all suppliers are clinic-specific
        isClinicCreated: true, // All are clinic-created now
        supplierManagerId: null, // Not applicable - using ClinicSupplierManager
        clinicSupplierManagerId: manager.id, // ClinicSupplierManager ID
      };
    });
  }

  /**
   * Clinic tomonidan manual supplier yaratish/update qilish
   * business_number va phone_number bo'yicha upsert qiladi
   */
  async createOrUpdateSupplierManual(
    dto: CreateSupplierManualDto,
    tenantId: string
  ) {
    // Validation
    if (!dto.companyName || !dto.businessNumber) {
      throw new BadRequestException("회사명과 사업자 등록번호는 필수입니다");
    }

    // Ensure company_email is always provided (required field)
    const companyEmail =
      dto.companyEmail || `${dto.businessNumber.replace(/-/g, "")}@temp.com`;

    try {
      return await this.prisma.executeWithRetry(async () => {
        // 1. Supplier upsert (business_number bo'yicha)

        const supplier = await this.prisma.supplier.upsert({
          where: { business_number: dto.businessNumber },
          update: {
            company_name: dto.companyName,
            company_phone: dto.companyPhone || null,
            company_email: companyEmail,
            company_address: dto.companyAddress || null,
            updated_at: new Date(),
          },
          create: {
            company_name: dto.companyName,
            business_number: dto.businessNumber,
            company_phone: dto.companyPhone || null,
            company_email: companyEmail,
            company_address: dto.companyAddress || null,
            status: "MANUAL_ONLY", // Clinic manual yaratgan supplier
            tenant_id: tenantId,
          },
        });

        // 2. ClinicSupplierManager upsert (tenant_id + phone_number bo'yicha, agar berilgan bo'lsa)
        let clinicManager = null;
        if (dto.phoneNumber && dto.managerName) {
          // Clinic context'da phone_number + tenant_id bo'yicha qidirish
          const existingClinicManager =
            await this.prisma.clinicSupplierManager.findFirst({
              where: {
                tenant_id: tenantId,
                phone_number: dto.phoneNumber,
              },
            });

          if (existingClinicManager) {
            // Update existing clinic manager
            clinicManager = await this.prisma.clinicSupplierManager.update({
              where: { id: existingClinicManager.id },
              data: {
                company_name: dto.companyName,
                business_number: dto.businessNumber || null,
                company_phone: dto.companyPhone || null,
                company_email: companyEmail,
                company_address: dto.companyAddress || null,
                name: dto.managerName,
                email1: dto.managerEmail || null,
                email2: null,
                position: dto.position || null,
                responsible_products: dto.responsibleProducts
                  ? dto.responsibleProducts.split(",").map((p) => p.trim())
                  : [],
                memo: dto.memo || null,
                updated_at: new Date(),
              },
            });
          } else {
            // Create new clinic manager
            clinicManager = await this.prisma.clinicSupplierManager.create({
              data: {
                tenant_id: tenantId,
                company_name: dto.companyName,
                business_number: dto.businessNumber || null,
                company_phone: dto.companyPhone || null,
                company_email: companyEmail,
                company_address: dto.companyAddress || null,
                name: dto.managerName,
                phone_number: dto.phoneNumber,
                email1: dto.managerEmail || null,
                email2: null,
                position: dto.position || null,
                certificate_image_url: null,
                responsible_regions: [],
                responsible_products: dto.responsibleProducts
                  ? dto.responsibleProducts.split(",").map((p) => p.trim())
                  : [],
                memo: dto.memo || null,
              },
            });
          }
        }

        // 3. Trade link creation removed
        // IMPORTANT: ClinicSupplierLink should NOT be auto-created when clinic manually creates supplier
        // Trade links should only be created when:
        // 1. Clinic creates a product with this supplier (automatic)
        // 2. Clinic manually approves trade relationship via approve-trade-link endpoint
        // This ensures that only clinics that have actually done business with the supplier
        // will see the supplier in primary search results

        return {
          supplier: {
            id: supplier.id,
            companyName: supplier.company_name,
            businessNumber: supplier.business_number,
            status: supplier.status,
          },
          clinicManager: clinicManager
            ? {
                id: clinicManager.id,
                name: clinicManager.name,
                phoneNumber: clinicManager.phone_number,
                email1: clinicManager.email1,
              }
            : null,
        };
      });
    } catch (error: any) {
      this.logger.error(
        `Error creating/updating supplier manually: ${error.message}`,
        error.stack
      );
      throw new BadRequestException(
        `공급업체 저장 중 오류가 발생했습니다: ${error.message}`
      );
    }
  }

  /**
   * Approve trade relationship with supplier
   * Called when clinic clicks "Yes" after phone search finds registered supplier
   * IMPORTANT: Now works with SupplierManager, not Supplier
   * Frontend sends supplierId (Supplier company ID) and optionally:
   * - supplierManagerId: Database ID of SupplierManager (preferred, most accurate)
   * - managerId: manager_id (like "회사명0001") as fallback
   */
  async approveTradeLink(
    tenantId: string,
    supplierId: string,
    managerId?: string,
    supplierManagerId?: string
  ) {
    try {
      const prisma = this.prisma as any;

      // First, get supplier to get its tenant_id
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
      });

      if (!supplier || !supplier.tenant_id) {
        throw new BadRequestException(
          "Supplier not found or missing tenant_id"
        );
      }

      // Find SupplierManager for this supplier (using supplier_tenant_id)
      // Priority: 1) supplierManagerId (database ID - most accurate), 2) managerId (manager_id), 3) first ACTIVE manager
      let supplierManager;

      // First, try to find by supplierManagerId (database ID) - most accurate
      if (supplierManagerId) {
        supplierManager = await prisma.supplierManager.findFirst({
          where: {
            id: supplierManagerId,
            supplier_tenant_id: supplier.tenant_id, // Use tenant_id
            status: "ACTIVE",
          },
        });
      }

      // If not found by supplierManagerId, try managerId (manager_id)
      if (!supplierManager && managerId) {
        supplierManager = await prisma.supplierManager.findFirst({
          where: {
            supplier_tenant_id: supplier.tenant_id, // Use tenant_id
            manager_id: managerId,
            status: "ACTIVE",
          },
        });
      }

      // If still not found, find first ACTIVE manager for this supplier
      if (!supplierManager) {
        supplierManager = await prisma.supplierManager.findFirst({
          where: {
            supplier_tenant_id: supplier.tenant_id, // Use tenant_id
            status: "ACTIVE", // Only active managers (registered on platform)
          },
          orderBy: {
            created_at: "asc", // Use first/oldest manager
          },
        });
      }

      if (!supplierManager) {
        throw new BadRequestException(
          "이 공급업체에 등록된 담당자를 찾을 수 없습니다. 공급업체가 플랫폼에 등록되어 있는지 확인해주세요."
        );
      }

      // Approve link using SupplierManager ID
      const link = await this.repository.approveTradeLink(
        tenantId,
        supplierManager.id
      );

      return {
        message: "거래 관계가 승인되었습니다",
        link: {
          id: link.id,
          tenantId: link.tenant_id,
          supplierManagerId: link.supplier_manager_id,
          supplierId: supplierId, // Keep supplierId for backward compatibility
          status: link.status,
          approvedAt: link.approved_at,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Error approving trade link: ${error.message}`,
        error.stack
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `거래 관계 승인 중 오류가 발생했습니다: ${error.message}`
      );
    }
  }

  /**
   * Delete ClinicSupplierManager
   * Only clinic-created managers can be deleted, not SupplierManager (platform managers)
   */
  async deleteClinicManager(managerId: string, tenantId: string) {
    // Faqat ClinicSupplierManager'ni o'chirish mumkin (SupplierManager o'chirilmaydi)
    const manager = await this.prisma.clinicSupplierManager.findFirst({
      where: {
        id: managerId,
        tenant_id: tenantId,
      },
    });

    if (!manager) {
      throw new BadRequestException("담당자를 찾을 수 없습니다");
    }

    await this.prisma.clinicSupplierManager.delete({
      where: {
        id: managerId,
      },
    });

    return { success: true, message: "담당자가 삭제되었습니다" };
  }

  /**
   * Get all ClinicSupplierManager records for a tenant
   * Used by supplier management page
   */
  async getAllClinicManagers(tenantId: string) {
    const managers = await this.prisma.clinicSupplierManager.findMany({
      where: {
        tenant_id: tenantId,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return managers.map((m) => ({
      id: m.id,
      company_name: m.company_name,
      business_number: m.business_number,
      company_phone: m.company_phone,
      company_email: m.company_email,
      company_address: m.company_address,
      name: m.name,
      phone_number: m.phone_number,
      email1: m.email1,
      email2: m.email2,
      position: m.position,
      responsible_products: m.responsible_products,
      responsible_regions: m.responsible_regions,
      memo: m.memo,
      certificate_image_url: m.certificate_image_url,
    }));
  }

  /**
   * Supplier manager'ga bog'langan clinic'larni olish
   * Supplier-frontend uchun
   */
  async getClinicsForSupplier(supplierManagerId: string) {
    try {
      // Get ClinicSupplierLink records for this supplier manager
      const links = await this.prisma.clinicSupplierLink.findMany({
        where: {
          supplier_manager_id: supplierManagerId,
        },
        orderBy: {
          created_at: "desc",
        },
      });

      // Get clinic data for each tenant_id
      const clinics = await Promise.all(
        links.map(async (link) => {
          try {
            const clinic = await this.prisma.clinic.findFirst({
              where: {
                tenant_id: link.tenant_id,
              },
            });
            return {
              ...link,
              clinic: clinic || null,
            };
          } catch (error: any) {
            this.logger.error(
              `Error fetching clinic for tenant_id ${link.tenant_id}: ${error.message}`
            );
            return {
              ...link,
              clinic: null,
            };
          }
        })
      );

      // Filter out null clinics and format response
      const result = clinics
        .filter((item) => item.clinic !== null)
        .map((item) => ({
          tenant_id: item.tenant_id,
          status: item.status,
          requested_at: item.requested_at,
          approved_at: item.approved_at,
          memo: (item as any).memo ?? null,
          clinic: {
            id: item.clinic!.id,
            name: item.clinic!.name,
            english_name: item.clinic!.english_name,
            category: item.clinic!.category,
            location: item.clinic!.location,
            phone_number: item.clinic!.phone_number,
            medical_subjects: item.clinic!.medical_subjects,
            doctor_name: item.clinic!.doctor_name || null, // 성명 (owner's name)
            license_type: item.clinic!.license_type,
            license_number: item.clinic!.license_number,
            document_issue_number: item.clinic!.document_issue_number,
          },
        }));

      return result;
    } catch (error: any) {
      this.logger.error(
        `Error in getClinicsForSupplier for supplier manager ${supplierManagerId}: ${error.message}`,
        error.stack
      );
      // Return empty array instead of throwing to prevent 500 error
      return [];
    }
  }

  /**
   * Clinic uchun memo saqlash
   */
  async updateClinicMemo(
    tenantId: string,
    supplierManagerId: string,
    memo: string | null
  ) {
    const updated = await (this.prisma.clinicSupplierLink as any).updateMany({
      where: {
        tenant_id: tenantId,
        supplier_manager_id: supplierManagerId,
      },
      data: {
        updated_at: new Date(),
        memo: memo || null,
      },
    });

    if (updated.count === 0) {
      throw new BadRequestException("ClinicSupplierLink not found");
    }

    return {
      message: "Memo updated successfully",
    };
  }
}
