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
    // Validate that at least one search parameter is provided
    if (!dto.companyName && !dto.phoneNumber && !dto.managerName) {
      throw new Error("회사명, 담당자 핸드폰 번호 또는 담당자 이름 중 하나는 필수입니다");
    }

    const suppliers = await this.repository.searchSuppliers(
      tenantId,
      dto.companyName,
      dto.phoneNumber,
      dto.managerName
    );

    // Format response
    return suppliers.map((supplier: any) => {
      // Get the first manager (or all managers if needed)
      const manager = supplier.managers?.[0];

      return {
        // 회사 정보
        companyName: supplier.company_name, // 회사명
        companyAddress: supplier.company_address, // 회사주소
        businessNumber: supplier.business_number, // 사업자 등록번호
        companyPhone: supplier.company_phone, // 회사 전화번호
        companyEmail: supplier.company_email, // 회사 이메일
        businessType: supplier.business_type, // 업태
        businessItem: supplier.business_item, // 종목
        productCategories: supplier.product_categories, // 취급 제품 카테고리
        status: supplier.status, // 상태

        // 담당자 정보
        managerId: manager?.manager_id || null, // 담당자 ID
        managerName: manager?.name || null, // 이름
        position: manager?.position || null, // 직함
        phoneNumber: manager?.phone_number || null, // 담당자 핸드폰 번호
        email1: manager?.email1 || null, // 이메일1
        email2: manager?.email2 || null, // 이메일2
        responsibleProducts: manager?.responsible_products || [], // 담당자 제품
        managerStatus: manager?.status || null, // 담당자 상태

        // All managers (if multiple)
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
      };
    });
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

    // Format response (same format as searchSuppliers)
    return suppliers.map((supplier: any) => {
      const manager = supplier.managers?.[0];

      return {
        companyName: supplier.company_name,
        companyAddress: supplier.company_address,
        businessNumber: supplier.business_number,
        companyPhone: supplier.company_phone,
        companyEmail: supplier.company_email,
        businessType: supplier.business_type,
        businessItem: supplier.business_item,
        productCategories: supplier.product_categories,
        status: supplier.status,
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
            status: "pending",
            tenant_id: tenantId,
          },
        });

        this.logger.log(`Supplier created/updated: ${supplier.id}`);

        // 2. SupplierManager upsert (phone_number bo'yicha, agar berilgan bo'lsa)
        let manager = null;
        if (dto.phoneNumber && dto.managerName) {
          this.logger.log(`Creating/updating manager with phone_number: ${dto.phoneNumber}`);
          
          // Manager ID generate qilish
          const formattedCompanyName = dto.companyName.replace(/\s+/g, "");
          const randomNumber = Math.floor(1000 + Math.random() * 9000);
          let managerId = `${formattedCompanyName}${randomNumber}`;

          // Duplicate tekshirish
          let existingId = await this.prisma.supplierManager.findUnique({
            where: { manager_id: managerId },
          });

          let attempts = 0;
          while (existingId && attempts < 10) {
            const randomNumber = Math.floor(1000 + Math.random() * 9000);
            managerId = `${formattedCompanyName}${randomNumber}`;
            existingId = await this.prisma.supplierManager.findUnique({
              where: { manager_id: managerId },
            });
            attempts++;
          }

          manager = await this.prisma.supplierManager.upsert({
            where: { phone_number: dto.phoneNumber },
            update: {
              name: dto.managerName,
              supplier_id: supplier.id,
              // password_hash va email1 ni update qilmaymiz (supplier to'ldiradi)
              updated_at: new Date(),
            },
            create: {
              supplier_id: supplier.id,
              manager_id: managerId,
              name: dto.managerName,
              phone_number: dto.phoneNumber,
              password_hash: null, // Clinic tomonidan yaratilganda null
              email1: dto.managerEmail || null, // Agar berilgan bo'lsa
              email2: null,
              certificate_image_url: null,
              responsible_regions: [],
              responsible_products: [],
              position: null,
              created_by: "clinic", // Clinic tomonidan yaratilganini belgilash
              status: "pending",
            },
          });

          this.logger.log(`Manager created/updated: ${manager.id}`);
        }

        return {
          supplier: {
            id: supplier.id,
            companyName: supplier.company_name,
            businessNumber: supplier.business_number,
            status: supplier.status,
          },
          manager: manager
            ? {
                id: manager.id,
                managerId: manager.manager_id,
                name: manager.name,
                phoneNumber: manager.phone_number,
                status: manager.status,
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
}

