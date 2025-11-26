import {
  Injectable,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { RegisterManagerDto } from "./dto/register-manager.dto";
import { RegisterContactDto } from "./dto/register-contact.dto";
import { RegisterCompleteDto } from "./dto/register-complete.dto";
import { hash } from "bcryptjs";

@Injectable()
export class ManagerService {
  constructor(private readonly prisma: PrismaService) {}

  async registerManager(dto: RegisterManagerDto) {
    // 1. Duplicate phone number check
    const existingManager = await this.prisma.executeWithRetry(async () => {
      // TODO: Check in SupplierManager table when schema is ready
      // For now, we'll just validate the data
      return null;
    });

    // Mock duplicate check - replace with actual DB query
    // if (existingManager) {
    //   throw new ConflictException("이미 등록된 휴대폰 번호입니다");
    // }

    // 3. Save manager data (pending approval)
    // TODO: Create SupplierManager model in Prisma schema
    // const manager = await this.prisma.supplierManager.create({
    //   data: {
    //     company_code: dto.companyCode,
    //     name: dto.name,
    //     phone_number: dto.phoneNumber,
    //     certificate_image_url: dto.certificateImageUrl,
    //     status: "pending", // Pending company approval
    //   },
    // });

    // Temporary response until schema is ready
    return {
      message: "담당자 가입 신청이 완료되었습니다. 회사 승인을 기다려주세요.",
      manager: {
        name: dto.name,
        phoneNumber: dto.phoneNumber,
        status: "pending",
      },
    };
  }

  async checkPhoneDuplicate(phoneNumber: string): Promise<boolean> {
    const existing = await this.prisma.executeWithRetry(async () => {
      return await this.prisma.supplierManager.findFirst({
        where: { phone_number: phoneNumber },
      });
    });
    return !!existing;
  }

  async registerCompany(dto: any) {
    // TODO: Create Supplier model in Prisma schema
    // const supplier = await this.prisma.supplier.create({
    //   data: {
    //     company_name: dto.companyName,
    //     business_number: dto.businessNumber,
    //     company_phone: dto.companyPhone,
    //     company_email: dto.companyEmail,
    //     company_address: dto.companyAddress,
    //     business_type: dto.businessType,
    //     business_item: dto.businessItem,
    //     product_categories: dto.productCategories,
    //     share_consent: dto.shareConsent,
    //     status: "pending", // Pending approval
    //   },
    // });

    // Temporary response until schema is ready
    return {
      message: "회사 정보가 저장되었습니다. 다음 단계로 진행하세요.",
      company: {
        companyName: dto.companyName,
        businessNumber: dto.businessNumber,
        companyPhone: dto.companyPhone,
        companyEmail: dto.companyEmail,
        status: "pending",
      },
    };
  }

  async registerContact(dto: RegisterContactDto) {
    // 1. Password confirmation validation
    if (dto.password !== dto.passwordConfirm) {
      throw new BadRequestException("비밀번호가 일치하지 않습니다");
    }

    // 2. Email duplication check (if email2 is provided)
    if (dto.email2 && dto.email1 === dto.email2) {
      throw new BadRequestException("이메일1과 이메일2는 서로 다르게 입력하세요");
    }

    // 3. Remove duplicates from regions and products
    const uniqueRegions = Array.from(new Set(dto.responsibleRegions.map((r) => r.trim()).filter((r) => r.length > 0)));
    const uniqueProducts = Array.from(new Set(dto.responsibleProducts.map((p) => p.trim()).filter((p) => p.length > 0)));

    if (uniqueRegions.length === 0) {
      throw new BadRequestException("최소 1개 이상의 담당 지역을 입력하세요");
    }

    if (uniqueProducts.length === 0) {
      throw new BadRequestException("최소 1개 이상의 담당 제품을 입력하세요");
    }

    // 4. Hash password
    const passwordHash = await hash(dto.password, 10);

    // 5. Save contact person information
    // TODO: Create SupplierContact model in Prisma schema
    // const contact = await this.prisma.supplierContact.create({
    //   data: {
    //     email1: dto.email1,
    //     email2: dto.email2 || null,
    //     password_hash: passwordHash,
    //     responsible_regions: uniqueRegions,
    //     responsible_products: uniqueProducts,
    //     status: "pending",
    //   },
    // });

    // 6. Create region tags
    // TODO: Create SupplierRegionTag model
    // for (const region of uniqueRegions) {
    //   await this.prisma.supplierRegionTag.upsert({
    //     where: { name: region },
    //     update: {},
    //     create: { name: region },
    //   });
    // }

    // 7. Create product tags
    // TODO: Create SupplierProductTag model
    // for (const product of uniqueProducts) {
    //   await this.prisma.supplierProductTag.upsert({
    //     where: { name: product },
    //     update: {},
    //     create: { name: product },
    //   });
    // }

    // Temporary response until schema is ready
    return {
      message: "담당자 정보가 저장되었습니다. 다음 단계로 진행하세요.",
      contact: {
        email1: dto.email1,
        email2: dto.email2,
        responsibleRegions: uniqueRegions,
        responsibleProducts: uniqueProducts,
        status: "pending",
      },
    };
  }

  async registerComplete(dto: RegisterCompleteDto) {
    return await this.prisma.executeWithRetry(async () => {
      // 1. Hash password
      const passwordHash = await hash(dto.contact.password, 10);

      // 2. Check for existing supplier by business_number
      const existingSupplier = await this.prisma.supplier.findUnique({
        where: { business_number: dto.company.businessNumber },
      });

      // 3. Check for existing manager by phone_number
      const existingManager = await this.prisma.supplierManager.findUnique({
        where: { phone_number: dto.manager.phoneNumber },
      });

      // 4. Check for duplicate email1 (only if not updating existing manager)
      if (!existingManager || existingManager.email1 !== dto.contact.email1) {
        const existingEmail = await this.prisma.supplierManager.findFirst({
          where: { email1: dto.contact.email1 },
        });

        if (existingEmail && existingEmail.id !== existingManager?.id) {
          throw new ConflictException("이미 등록된 이메일 주소입니다");
        }
      }

      // 5. Agar manager mavjud bo'lsa va password_hash null bo'lsa (clinic tomonidan yaratilgan)
      // yoki password_hash mavjud bo'lsa (allaqachon ro'yxatdan o'tgan) - error
      if (existingManager) {
        if (existingManager.password_hash) {
          throw new ConflictException("이미 등록된 휴대폰 번호입니다");
        }
        // Agar password_hash null bo'lsa, update qilamiz
      }

      // 6. Supplier upsert (business_number bo'yicha)
      const supplier = existingSupplier
        ? await this.prisma.supplier.update({
            where: { id: existingSupplier.id },
            data: {
              company_name: dto.company.companyName,
              company_phone: dto.company.companyPhone || null,
              company_email: dto.company.companyEmail || "",
              company_address: dto.company.companyAddress || null,
              business_type: dto.company.businessType || null,
              business_item: dto.company.businessItem || null,
              product_categories: dto.company.productCategories || [],
              share_consent: dto.company.shareConsent || false,
              updated_at: new Date(),
            },
          })
        : await this.prisma.supplier.create({
            data: {
              company_name: dto.company.companyName,
              business_number: dto.company.businessNumber,
              company_phone: dto.company.companyPhone || null,
              company_email: dto.company.companyEmail || "",
              company_address: dto.company.companyAddress || null,
              business_type: dto.company.businessType || null,
              business_item: dto.company.businessItem || null,
              product_categories: dto.company.productCategories || [],
              share_consent: dto.company.shareConsent || false,
              status: "pending",
            },
          });

      // 7. Generate manager ID if not provided (회사이름+4자리 랜덤 숫자)
      let managerId = dto.managerId || existingManager?.manager_id;
      if (!managerId) {
        const formattedCompanyName = dto.company.companyName.replace(/\s+/g, "");
        // Generate random 4-digit number (1000-9999)
        let randomNumber = Math.floor(1000 + Math.random() * 9000);
        managerId = `${formattedCompanyName}${randomNumber}`;
        
        // Check for duplicate managerId and regenerate if needed
        let existingId = await this.prisma.supplierManager.findUnique({
          where: { manager_id: managerId },
        });
        
        let attempts = 0;
        while (existingId && attempts < 10) {
          randomNumber = Math.floor(1000 + Math.random() * 9000);
          managerId = `${formattedCompanyName}${randomNumber}`;
          existingId = await this.prisma.supplierManager.findUnique({
            where: { manager_id: managerId },
          });
          attempts++;
        }
        
        if (existingId) {
          throw new BadRequestException("담당자 ID 생성에 실패했습니다. 다시 시도해주세요.");
        }
      } else if (dto.managerId && dto.managerId !== existingManager?.manager_id) {
        // Check if provided managerId is unique (only if different from existing)
        const existingId = await this.prisma.supplierManager.findUnique({
          where: { manager_id: managerId },
        });
        
        if (existingId) {
          throw new ConflictException("이미 사용 중인 담당자 ID입니다");
        }
      }

      // 8. Remove duplicates from regions and products
      const uniqueRegions = Array.from(
        new Set(dto.contact.responsibleRegions.map((r) => r.trim()).filter((r) => r.length > 0))
      );
      const uniqueProducts = Array.from(
        new Set(dto.contact.responsibleProducts.map((p) => p.trim()).filter((p) => p.length > 0))
      );

      // 9. SupplierManager upsert (phone_number bo'yicha)
      const manager = existingManager
        ? await this.prisma.supplierManager.update({
            where: { id: existingManager.id },
            data: {
              supplier_id: supplier.id,
              manager_id: managerId,
              name: dto.manager.name,
              certificate_image_url: dto.manager.certificateImageUrl || existingManager.certificate_image_url,
              password_hash: passwordHash, // Update password_hash
              email1: dto.contact.email1, // Update email1
              email2: dto.contact.email2 || null,
              responsible_regions: uniqueRegions,
              responsible_products: uniqueProducts,
              position: dto.manager.position || null,
              created_by: "supplier", // Supplier tomonidan to'ldirilganini belgilash
              status: "pending",
              updated_at: new Date(),
            },
          })
        : await this.prisma.supplierManager.create({
            data: {
              supplier_id: supplier.id,
              manager_id: managerId,
              name: dto.manager.name,
              phone_number: dto.manager.phoneNumber,
              certificate_image_url: dto.manager.certificateImageUrl || null,
              password_hash: passwordHash,
              email1: dto.contact.email1,
              email2: dto.contact.email2 || null,
              responsible_regions: uniqueRegions,
              responsible_products: uniqueProducts,
              position: dto.manager.position || null,
              created_by: "supplier",
              status: "pending",
            },
          });

      // 10. Create region tags
      for (const region of uniqueRegions) {
        await this.prisma.supplierRegionTag.upsert({
          where: { name: region },
          update: {},
          create: { name: region },
        });
      }

      // 11. Create product tags
      for (const product of uniqueProducts) {
        await this.prisma.supplierProductTag.upsert({
          where: { name: product },
          update: {},
          create: { name: product },
        });
      }

      return {
        message: "회원가입이 완료되었습니다. 로그인해주세요.",
        managerId: managerId,
        data: {
          supplier: {
            id: supplier.id,
            companyName: supplier.company_name,
            businessNumber: supplier.business_number,
            status: supplier.status,
          },
          manager: {
            id: manager.id,
            managerId: manager.manager_id,
            name: manager.name,
            phoneNumber: manager.phone_number,
            email1: manager.email1,
            status: manager.status,
          },
        },
      };
    });
  }
}

