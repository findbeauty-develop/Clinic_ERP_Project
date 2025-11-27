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
      throw new Error("회사명 또는 담당자 이름 중 하나는 필수입니다. 전화번호로 검색하려면 /supplier/search-by-phone 엔드포인트를 사용하세요.");
    }

    // If phoneNumber is provided, reject it - phone search should use separate endpoint
    if (dto.phoneNumber) {
      throw new Error("전화번호로 검색하려면 /supplier/search-by-phone 엔드포인트를 사용하세요.");
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

        const verifiedManagerIds = new Set(verifiedLinks.map((link: any) => link.supplier_manager_id));
        
        // Filter suppliers to only include those with at least one approved manager
        const verifiedSuppliers = suppliers.filter((supplier: any) => {
          if (!supplier.managers || supplier.managers.length === 0) return false;
          return supplier.managers.some((m: any) => verifiedManagerIds.has(m.id));
        });

        // Filter managers within each supplier to only include approved ones
        verifiedSuppliers.forEach((supplier: any) => {
          if (supplier.managers) {
            supplier.managers = supplier.managers.filter((m: any) => verifiedManagerIds.has(m.id));
          }
        });

        // If any suppliers were filtered out, log a warning
        if (verifiedSuppliers.length !== suppliers.length) {
          this.logger.warn(
            `Filtered out ${suppliers.length - verifiedSuppliers.length} suppliers without APPROVED ClinicSupplierLink`
          );
        }

        // Only return verified suppliers
        const suppliersToReturn = verifiedSuppliers;
      
        // Format response
        return suppliersToReturn.map((supplier: any) => {
          // Get the first manager (prioritize SupplierManager over ClinicSupplierManager)
          const manager = supplier.managers?.[0] || supplier.clinicManagers?.[0];

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
            managers: supplier.managers?.map((m: any) => ({
              managerId: m.manager_id,
              name: m.name,
              position: m.position,
              phoneNumber: m.phone_number,
              email1: m.email1,
              email2: m.email2,
              responsibleProducts: m.responsible_products,
              status: m.status,
            })) || [],

            // Clinic managers (ClinicSupplierManager - clinic-specific)
            clinicManagers: supplier.clinicManagers?.map((m: any) => ({
              id: m.id,
              name: m.name,
              position: m.position,
              phoneNumber: m.phone_number,
              email1: m.email1,
              email2: m.email2,
              responsibleProducts: m.responsible_products,
            })) || [],
          };
        });
      }
    }

    // If no suppliers returned from repository, return empty array
    return [];
  }

  /**
   * Fallback search by phone number without transaction history filter
   * Used when main search returns no results
   */
  async searchSuppliersByPhone(phoneNumber: string) {
    if (!phoneNumber) {
      throw new Error("핸드폰 번호는 필수입니다");
    }

    const suppliers = await this.repository.searchSuppliersByPhone(phoneNumber);

    // Format response (same format as searchSuppliers, but with isRegisteredOnPlatform flag)
    return suppliers.map((supplier: any) => {
      // Get the first manager (prioritize SupplierManager over ClinicSupplierManager)
      const manager = supplier.managers?.[0] || supplier.clinicManagers?.[0];

      // Check if supplier is registered on platform (has ACTIVE SupplierManager)
      const isRegisteredOnPlatform = supplier.managers?.some((m: any) => m.status === "ACTIVE") || false;

      return {
        id: supplier.id, // Supplier company ID
        supplierId: supplier.id, // Alias for clarity
        companyName: supplier.company_name,
        companyAddress: supplier.company_address,
        businessNumber: supplier.business_number,
        companyPhone: supplier.company_phone,
        companyEmail: supplier.company_email,
        businessType: supplier.business_type,
        businessItem: supplier.business_item,
        productCategories: supplier.product_categories,
        status: supplier.status,
        isRegisteredOnPlatform, // Flag: supplier platformada ro'yxatdan o'tgan
        managerId: manager?.manager_id || null,
        managerName: manager?.name || null,
        position: manager?.position || null,
        phoneNumber: manager?.phone_number || null,
        email1: manager?.email1 || null,
        email2: manager?.email2 || null,
        responsibleProducts: manager?.responsible_products || [],
        managerStatus: manager?.status || null,
        managers: supplier.managers?.map((m: any) => ({
          managerId: m.manager_id,
          name: m.name,
          position: m.position,
          phoneNumber: m.phone_number,
          email1: m.email1,
          email2: m.email2,
          responsibleProducts: m.responsible_products,
          status: m.status,
        })) || [],
        clinicManagers: supplier.clinicManagers?.map((m: any) => ({
          id: m.id,
          name: m.name,
          position: m.position,
          phoneNumber: m.phone_number,
          email1: m.email1,
          email2: m.email2,
          responsibleProducts: m.responsible_products,
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
    this.logger.log(`Creating/updating supplier manually: ${dto.companyName}, businessNumber: ${dto.businessNumber}, tenantId: ${tenantId}`);
    
    // Validation
    if (!dto.companyName || !dto.businessNumber) {
      throw new BadRequestException("회사명과 사업자 등록번호는 필수입니다");
    }

    // Ensure company_email is always provided (required field)
    const companyEmail = dto.companyEmail || `${dto.businessNumber.replace(/-/g, '')}@temp.com`;
    
    try {
      return await this.prisma.executeWithRetry(async () => {
        // 1. Supplier upsert (business_number bo'yicha)
        this.logger.log(`Upserting supplier with business_number: ${dto.businessNumber}`);
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

        this.logger.log(`Supplier created/updated: ${supplier.id}`);

        // 2. ClinicSupplierManager upsert (tenant_id + phone_number bo'yicha, agar berilgan bo'lsa)
        let clinicManager = null;
        if (dto.phoneNumber && dto.managerName) {
          this.logger.log(`Creating/updating clinic manager with phone_number: ${dto.phoneNumber}, tenantId: ${tenantId}`);
          
          // Clinic context'da phone_number + tenant_id bo'yicha qidirish
          const existingClinicManager = await this.prisma.clinicSupplierManager.findFirst({
            where: {
              supplier_id: supplier.id,
              tenant_id: tenantId,
              phone_number: dto.phoneNumber,
            },
          });

          if (existingClinicManager) {
            // Update existing clinic manager
            clinicManager = await this.prisma.clinicSupplierManager.update({
              where: { id: existingClinicManager.id },
              data: {
                name: dto.managerName,
                email1: dto.managerEmail || null,
                email2: null,
                position: null,
                updated_at: new Date(),
              },
            });
          } else {
            // Create new clinic manager
            clinicManager = await this.prisma.clinicSupplierManager.create({
              data: {
                supplier_id: supplier.id,
                tenant_id: tenantId,
                name: dto.managerName,
                phone_number: dto.phoneNumber,
                email1: dto.managerEmail || null,
                email2: null,
                position: null,
                certificate_image_url: null,
                responsible_regions: [],
                responsible_products: [],
              },
            });
          }

          this.logger.log(`Clinic manager created/updated: ${clinicManager.id}`);
        }

      // 3. Create trade link (REQUESTED status) - ONLY if SupplierManager exists
      // IMPORTANT: Trade links are now to SupplierManager, not Supplier
      // If supplier hasn't registered on platform yet, there's no SupplierManager, so no link
      const supplierManager = await this.prisma.supplierManager.findFirst({
        where: {
          supplier_id: supplier.id,
          status: "ACTIVE",
        },
      });

      if (supplierManager) {
        // Supplier has registered on platform, create trade link to SupplierManager
        await this.repository.createOrGetTradeLink(tenantId, supplierManager.id);
        this.logger.log(`Trade link created for SupplierManager: ${supplierManager.id}`);
      } else {
        // No SupplierManager yet (manual creation only), link will be created when supplier signs up
        this.logger.log(`No SupplierManager found for supplier ${supplier.id}, skipping trade link creation`);
      }

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
      this.logger.error(`Error creating/updating supplier manually: ${error.message}`, error.stack);
      throw new BadRequestException(
        `공급업체 저장 중 오류가 발생했습니다: ${error.message}`
      );
    }
  }

  /**
   * Approve trade relationship with supplier
   * Called when clinic clicks "Yes" after phone search finds registered supplier
   * IMPORTANT: Now works with SupplierManager, not Supplier
   * Frontend sends supplierId (Supplier company ID), we need to find SupplierManager
   */
  async approveTradeLink(tenantId: string, supplierId: string) {
    this.logger.log(`Approving trade link: tenantId=${tenantId}, supplierId=${supplierId}`);
    
    try {
      const prisma = this.prisma as any;
      
      // Find SupplierManager for this supplier
      // Prefer ACTIVE SupplierManager (registered on platform)
      const supplierManager = await prisma.supplierManager.findFirst({
        where: {
          supplier_id: supplierId,
          status: "ACTIVE", // Only active managers (registered on platform)
        },
        orderBy: {
          created_at: "asc", // Use first/oldest manager
        },
      });

      if (!supplierManager) {
        throw new BadRequestException(
          "이 공급업체에 등록된 담당자를 찾을 수 없습니다. 공급업체가 플랫폼에 등록되어 있는지 확인해주세요."
        );
      }

      // Approve link using SupplierManager ID
      const link = await this.repository.approveTradeLink(tenantId, supplierManager.id);
      
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
      this.logger.error(`Error approving trade link: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `거래 관계 승인 중 오류가 발생했습니다: ${error.message}`
      );
    }
  }
}

