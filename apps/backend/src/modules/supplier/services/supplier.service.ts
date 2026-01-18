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
    // Primary search: companyName + managerName
    // STRICT RULE: phoneNumber should NOT be used in primary search
    // phoneNumber is only for fallback search (searchSuppliersByPhone)

    // Validate that companyName and/or managerName is provided (phoneNumber is NOT allowed here)
    if (!dto.companyName && !dto.managerName) {
      throw new Error(
        "회사명 또는 담당자 이름 중 하나는 필수입니다. 전화번호로 검색하려면 /supplier/search-by-phone 엔드포인트를 사용하세요."
      );
    }

    // If phoneNumber is provided, reject it - phone search should use separate endpoint
    if (dto.phoneNumber) {
      throw new Error(
        "전화번호로 검색하려면 /supplier/search-by-phone 엔드포인트를 사용하세요."
      );
    }

    // Primary search: companyName + managerName
    // ONLY returns suppliers with APPROVED ClinicSupplierLink
    // If no APPROVED link exists, returns empty array (no results)
    const suppliers = await this.repository.searchSuppliers(
      tenantId,
      dto.companyName,
      undefined, // phoneNumber is NOT allowed in primary search
      dto.managerName
    );

    // CRITICAL SAFETY CHECK: Verify all returned suppliers have APPROVED ClinicSupplierLink
    // IMPORTANT: ClinicSupplierLink now links to SupplierManager, not Supplier
    // We need to check if any SupplierManager from these suppliers has APPROVED link
    if (suppliers.length > 0) {
      const prisma = this.prisma as any;

      // Get all SupplierManager IDs from returned suppliers
      const allManagerIds: string[] = [];
      suppliers.forEach((s: any) => {
        if (s.managers && s.managers.length > 0) {
          s.managers.forEach((m: any) => {
            if (m.id) allManagerIds.push(m.id);
          });
        }
      });

      if (allManagerIds.length > 0) {
        // Double-check: Get APPROVED links for these SupplierManagers
        const verifiedLinks = await prisma.clinicSupplierLink.findMany({
          where: {
            tenant_id: tenantId,
            supplier_manager_id: { in: allManagerIds },
            status: "APPROVED",
          },
          select: {
            supplier_manager_id: true,
          },
        });

        const verifiedManagerIds = new Set(
          verifiedLinks.map((link: any) => link.supplier_manager_id)
        );

        // Filter suppliers to only include those with at least one approved manager
        const verifiedSuppliers = suppliers.filter((supplier: any) => {
          if (!supplier.managers || supplier.managers.length === 0)
            return false;
          return supplier.managers.some((m: any) =>
            verifiedManagerIds.has(m.id)
          );
        });

        // Filter managers within each supplier to only include approved ones
        verifiedSuppliers.forEach((supplier: any) => {
          if (supplier.managers) {
            supplier.managers = supplier.managers.filter((m: any) =>
              verifiedManagerIds.has(m.id)
            );
          }
        });

        // If any suppliers were filtered out, log a warning
        if (verifiedSuppliers.length !== suppliers.length) {
          this.logger.warn(
            `Filtered out ${
              suppliers.length - verifiedSuppliers.length
            } suppliers without APPROVED ClinicSupplierLink`
          );
        }

        // Only return verified suppliers
        const suppliersToReturn = verifiedSuppliers;

        // Format response
        return suppliersToReturn.map((supplier: any) => {
          // IMPORTANT: Primary search matches ONLY by SupplierManager.name
          // Get the first manager (use SupplierManager)
          // SupplierManager is from platform-registered suppliers (has login credentials)
          const manager = supplier.managers?.[0];

          return {
            // 회사 정보
            id: supplier.id, // Supplier company ID
            supplierId: supplier.id, // Alias for clarity
            companyName: supplier.company_name, // 회사명
            companyAddress: supplier.company_address, // 회사주소
            businessNumber: supplier.business_number, // 사업자 등록번호
            companyPhone: supplier.company_phone, // 회사 전화번호
            companyEmail: supplier.company_email, // 회사 이메일
            businessType: supplier.business_type, // 업태
            businessItem: supplier.business_item, // 종목
            productCategories: supplier.product_categories, // 취급 제품 카테고리
            status: supplier.status, // 상태

            // 담당자 정보 (SupplierManager yoki ClinicSupplierManager)
            managerId: manager?.manager_id || null, // 담당자 ID (SupplierManager'da mavjud)
            managerName: manager?.name || null, // 이름
            position: manager?.position || null, // 직함
            phoneNumber: manager?.phone_number || null, // 담당자 핸드폰 번호
            email1: manager?.email1 || null, // 이메일1
            email2: manager?.email2 || null, // 이메일2
            responsibleProducts: manager?.responsible_products || [], // 담당자 제품
            managerStatus: manager?.status || null, // 담당자 상태 (SupplierManager'da mavjud)

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
    }

    // If no suppliers returned from repository, return empty array
    return [];
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
   * Fallback search by phone number without transaction history filter
   * Used when main search returns no results
   * Also searches clinic-created suppliers (ClinicSupplierManager)
   */
  async searchSuppliersByPhone(phoneNumber: string, tenantId: string) {
    if (!phoneNumber) {
      throw new Error("핸드폰 번호는 필수입니다");
    }

    const suppliers = await this.repository.searchSuppliersByPhone(
      phoneNumber,
      tenantId
    );

    // Format response (same format as searchSuppliers, but with isRegisteredOnPlatform flag)
    return suppliers.map((supplier: any) => {
      // Get the first manager (use SupplierManager or ClinicSupplierManager)
      // IMPORTANT: For phone search, we want the manager that matches the phone number
      const manager = supplier.managers?.[0];

      // Check if supplier is registered on platform (has ACTIVE SupplierManager)
      // ✅ Agar isClinicCreated flag bo'lsa, bu ClinicSupplierManager
      const isRegisteredOnPlatform =
        !supplier.isClinicCreated &&
        (supplier.managers?.some((m: any) => m.status === "ACTIVE") || false);

      // Get the SupplierManager ID (not manager_id, but the actual database ID)
      // ✅ Agar ClinicSupplierManager bo'lsa, clinicSupplierManagerId'ni qaytarish
      const supplierManagerId = supplier.isClinicCreated
        ? null // ClinicSupplierManager uchun SupplierManager ID yo'q
        : supplier.managers?.[0]?.id || null;

      // ✅ ClinicSupplierManager ID'ni olish
      const clinicSupplierManagerId = supplier.clinicSupplierManagerId || null;

      // Debug logging

      return {
        id: supplier.id, // Supplier company ID yoki ClinicSupplierManager ID
        supplierId: supplier.id, // Alias for clarity
        companyName: supplier.company_name,
        companyAddress: supplier.company_address,
        businessNumber: supplier.business_number,
        companyPhone: supplier.company_phone,
        companyEmail: supplier.company_email,
        businessType: supplier.business_type,
        businessItem: supplier.business_item,
        productCategories: supplier.product_categories || [],
        status: supplier.status,
        isRegisteredOnPlatform, // Flag: supplier platformada ro'yxatdan o'tgan
        isClinicCreated: supplier.isClinicCreated || false, // ✅ Flag: Clinic yaratgan supplier
        managerId: manager?.manager_id || null, // manager_id (like "회사명0001") yoki null ClinicSupplierManager uchun
        supplierManagerId: supplierManagerId, // Database ID of SupplierManager (for creating ClinicSupplierLink)
        clinicSupplierManagerId: clinicSupplierManagerId, // ✅ ClinicSupplierManager ID
        managerName: manager?.name || null,
        position: manager?.position || null,
        phoneNumber: manager?.phone_number || null,
        email1: manager?.email1 || null,
        email2: manager?.email2 || null,
        responsibleProducts: manager?.responsible_products || [],
        managerStatus: manager?.status || null,
        managers:
          supplier.managers?.map((m: any) => ({
            id: m.id, // Database ID
            managerId: m.manager_id || null, // manager_id (like "회사명0001") yoki null ClinicSupplierManager uchun
            name: m.name,
            position: m.position,
            phoneNumber: m.phone_number,
            email1: m.email1,
            email2: m.email2,
            responsibleProducts: m.responsible_products || [],
            status: m.status,
          })) || [],
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
