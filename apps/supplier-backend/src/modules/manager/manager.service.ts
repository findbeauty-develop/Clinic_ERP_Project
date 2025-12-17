import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { RegisterManagerDto } from "./dto/register-manager.dto";
import { RegisterContactDto } from "./dto/register-contact.dto";
import { RegisterCompleteDto } from "./dto/register-complete.dto";
import { hash, compare } from "bcryptjs";
import { BusinessVerificationService } from "../../services/business-verification.service";
import { GoogleVisionService } from "../../services/google-vision.service";
import { BusinessCertificateParserService } from "../../services/business-certificate-parser.service";
import { SolapiProvider } from "../../services/providers/solapi.provider";
import { ConfigService } from "@nestjs/config";
import { join } from "path";
import * as fs from "fs/promises";

@Injectable()
export class ManagerService {
  private readonly logger = new Logger(ManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly businessVerificationService: BusinessVerificationService,
    private readonly googleVisionService: GoogleVisionService,
    private readonly certificateParser: BusinessCertificateParserService,
    private readonly solapiProvider: SolapiProvider,
    private readonly configService: ConfigService,
  ) {}

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

    // 2. Manager address validation
    if (!dto.managerAddress || dto.managerAddress.trim().length === 0) {
      throw new BadRequestException("담당자 주소를 입력하세요");
    }

    // 3. Remove duplicates from products
    const uniqueProducts = Array.from(new Set(dto.responsibleProducts.map((p) => p.trim()).filter((p) => p.length > 0)));

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
        managerAddress: dto.managerAddress,
        responsibleProducts: uniqueProducts,
        status: "pending",
      },
    };
  }

  async registerComplete(dto: RegisterCompleteDto) {
    // Use transaction to ensure all-or-nothing: if validation fails, nothing is saved
    // Wrap in executeWithRetry for connection error handling
    return await this.prisma.executeWithRetry(async () => {
      return await this.prisma.$transaction(async (tx: any) => {
        // STEP 1: ALL VALIDATIONS FIRST - before any database writes
        
        // 1. Extract OCR data from certificate if provided (for verification)
        let representativeName: string | undefined;
        let openingDate: string | undefined;

        if (dto.manager.certificateImageUrl) {
          try {
            // Extract file path from URL
            // URL format: /uploads/supplier/certificate/filename.jpg
            const uploadRoot = join(process.cwd(), 'uploads');
            const relativePath = dto.manager.certificateImageUrl.replace(/^\/uploads\//, '');
            const filePath = join(uploadRoot, relativePath);
            
            // Read file and extract OCR
            const buffer = await fs.readFile(filePath);
            const rawText = await this.googleVisionService.extractTextFromBuffer(buffer);
            const parsedFields = this.certificateParser.parseBusinessCertificate(rawText);
            
            representativeName = parsedFields.representativeName;
            openingDate = parsedFields.openingDate;
            
            // Log extracted data
            if (representativeName && openingDate) {
              console.log(`✅ OCR extracted - Representative: ${representativeName}, Opening Date: ${openingDate}`);
            } else {
              console.warn(`⚠️ OCR extraction incomplete - Representative: ${representativeName || 'undefined'}, Opening Date: ${openingDate || 'undefined'}`);
              console.warn(`Parsed fields: ${JSON.stringify({
                representativeName: parsedFields.representativeName,
                openingDate: parsedFields.openingDate,
                businessNumber: parsedFields.businessNumber,
                companyName: parsedFields.companyName,
              })}`);
            }
          } catch (error) {
            console.error('Failed to extract OCR data from certificate:', error);
            // Continue without OCR data - verification will fail if required
          }
        }

        // 2. Verify business number with data.go.kr API (only if all required data is available)
        // Verification is only performed when ALL required fields are extracted from OCR
        // NOTE: API verification is optional - if API fails (404, connection error, etc.), registration continues
        if (representativeName && openingDate && dto.company.businessNumber) {
          try {
            // All required data is available - attempt verification
            const verification = await this.businessVerificationService.verifyBusinessNumber({
              businessNumber: dto.company.businessNumber,
              representativeName: representativeName,
              openingDate: openingDate,
            });

            if (verification.isValid) {
              // Log verification success
              this.logger.log(`Business verification successful - Status: ${verification.businessStatus}`);
            } else {
              // Verification failed - check if it's an API error or data mismatch
              const errorMessage = verification.error || '';
              
              // If it's an API error (404, connection failed, etc.), log warning but continue registration
              if (errorMessage.includes('404') || 
                  errorMessage.includes('Not Found') || 
                  errorMessage.includes('API request failed') ||
                  errorMessage.includes('Cannot connect') ||
                  errorMessage.includes('timeout') ||
                  errorMessage.includes('API key is not configured')) {
                this.logger.warn(`Business verification API error: ${errorMessage}. Registration will continue without verification.`);
                // Continue registration - API errors don't block registration
              } else {
                // Data mismatch - this is a real validation error
                throw new BadRequestException(
                  verification.error || 
                  '사업자등록번호 진위확인에 실패했습니다. 사업자등록증의 정보(사업자등록번호, 대표자명, 개업일자)가 정확한지 확인해주세요.'
                );
              }
            }
          } catch (error: any) {
            // If it's already a BadRequestException (data mismatch), re-throw it
            if (error instanceof BadRequestException) {
              throw error;
            }
            
            // For other errors (network, API unavailable, etc.), log and continue
            this.logger.warn(`Business verification failed due to API error: ${error?.message || 'Unknown error'}. Registration will continue without verification.`);
            // Continue registration - API errors don't block registration
          }
        } else {
          // OCR data incomplete - skip verification but log warning
          const missingFields = [];
          if (!representativeName) missingFields.push('대표자명');
          if (!openingDate) missingFields.push('개업일자');
          if (!dto.company.businessNumber) missingFields.push('사업자등록번호');
          
          this.logger.warn(`OCR data incomplete for business verification. Missing: ${missingFields.join(', ')}. Skipping verification.`);
          // Registration continues without verification when data is incomplete
        }
        
        // 3. Hash password
        const passwordHash = await hash(dto.contact.password, 10);

        // 4. Check for existing supplier by business_number
        const existingSupplier = await tx.supplier.findUnique({
          where: { business_number: dto.company.businessNumber },
        });

        // 5. Check for existing SupplierManager by phone_number (global, login uchun)
        // CRITICAL: This validation MUST happen before any writes
        const existingManager = await tx.supplierManager.findUnique({
          where: { phone_number: dto.manager.phoneNumber },
        });

        // 6. Validate: If SupplierManager exists with password_hash, registration is not allowed
        if (existingManager && existingManager.password_hash) {
          throw new ConflictException("이미 등록된 휴대폰 번호입니다");
        }

        // 7. Check for duplicate email1 in SupplierManager (if email1 is provided)
        if (dto.contact.email1 && (!existingManager || existingManager.email1 !== dto.contact.email1)) {
          const existingEmail = await tx.supplierManager.findFirst({
            where: { email1: dto.contact.email1 },
          });

          if (existingEmail && existingEmail.id !== existingManager?.id) {
            throw new ConflictException("이미 등록된 이메일 주소입니다");
          }
        }

        // 8. Check for ClinicSupplierManager (clinic tomonidan yaratilgan)
        // Matching: business_number + phone_number + name
        const existingClinicManager = existingSupplier
          ? await tx.clinicSupplierManager.findFirst({
              where: {
                supplier_id: existingSupplier.id,
                phone_number: dto.manager.phoneNumber,
                name: dto.manager.name, // Name ham mos kelishi kerak
              },
            })
          : null;

        // STEP 2: All validations passed, now proceed with database writes

        // 7. Supplier upsert (business_number bo'yicha) - CLAIM existing company if exists
        // If company exists (created by clinic manually), claim it and set to ACTIVE
        // Supplier signup data takes precedence, but preserve manual fields if missing
        const supplier = existingSupplier
          ? await tx.supplier.update({
            where: { id: existingSupplier.id },
            data: {
              // Supplier signup data takes precedence
              company_name: dto.company.companyName,
              company_phone: dto.company.companyPhone || existingSupplier.company_phone || null,
              company_email: dto.company.companyEmail || existingSupplier.company_email,
              company_address: dto.company.companyAddress || existingSupplier.company_address || null,
              product_categories: (dto.company.productCategories && dto.company.productCategories.length > 0)
                ? dto.company.productCategories 
                : existingSupplier.product_categories,
              share_consent: dto.company.shareConsent !== undefined 
                ? dto.company.shareConsent 
                : existingSupplier.share_consent,
              status: "ACTIVE", // Claim existing company - set to ACTIVE
              // tenant_id is preserved from existing supplier (same company, same tenant_id)
              updated_at: new Date(),
            },
          })
        : await tx.supplier.create({
            data: {
              company_name: dto.company.companyName,
              business_number: dto.company.businessNumber,
              company_phone: dto.company.companyPhone || null,
              company_email: dto.company.companyEmail || "",
              company_address: dto.company.companyAddress || null,
              product_categories: dto.company.productCategories || [],
              share_consent: dto.company.shareConsent || false,
              status: "ACTIVE", // New supplier signup - immediately ACTIVE (no approval needed)
              tenant_id: `supplier_${dto.company.businessNumber.replace(/[^0-9]/g, "")}_${Date.now()}`, // Generate unique tenant_id for new company
            },
          });

        // 8. Remove duplicates from products
        const uniqueProducts = Array.from(
          new Set(dto.contact.responsibleProducts.map((p) => p.trim()).filter((p) => p.length > 0))
        );

        // 9. Manager address and products
        const managerAddress = dto.contact.managerAddress?.trim() || null;
        const finalProducts = existingClinicManager && existingClinicManager.responsible_products.length > 0
          ? existingClinicManager.responsible_products
          : uniqueProducts;

        // 10. Generate manager ID if not provided (회사이름+4자리 랜덤 숫자)
        let managerId = dto.managerId || existingManager?.manager_id;
        if (!managerId) {
          const formattedCompanyName = dto.company.companyName.replace(/\s+/g, "");
          // Generate random 4-digit number (1000-9999)
          let randomNumber = Math.floor(1000 + Math.random() * 9000);
          managerId = `${formattedCompanyName}${randomNumber}`;
          
          // Check for duplicate managerId and regenerate if needed
          let existingId = await tx.supplierManager.findUnique({
            where: { manager_id: managerId },
          });
          
          let attempts = 0;
          while (existingId && attempts < 10) {
            randomNumber = Math.floor(1000 + Math.random() * 9000);
            managerId = `${formattedCompanyName}${randomNumber}`;
            existingId = await tx.supplierManager.findUnique({
              where: { manager_id: managerId },
            });
            attempts++;
          }
          
          if (existingId) {
            throw new BadRequestException("담당자 ID 생성에 실패했습니다. 다시 시도해주세요.");
          }
        } else if (dto.managerId && dto.managerId !== existingManager?.manager_id) {
          // Check if provided managerId is unique (only if different from existing)
          const existingId = await tx.supplierManager.findUnique({
            where: { manager_id: managerId },
          });
          
          if (existingId) {
            throw new ConflictException("이미 사용 중인 담당자 ID입니다");
          }
        }

        // 11. SupplierManager yaratish (phone_number UNIQUE, shuning uchun create yoki error)
        // Validation already done above - if we reach here, existingManager check passed
        // Yangi SupplierManager yaratish
        const manager = await tx.supplierManager.create({
          data: {
            supplier_tenant_id: supplier.tenant_id!, // Supplier'ning tenant_id'si
            clinic_manager_id: existingClinicManager?.id || null, // ClinicSupplierManager bilan link
            manager_id: managerId,
            name: dto.manager.name,
            phone_number: dto.manager.phoneNumber,
            certificate_image_url: dto.manager.certificateImageUrl || existingClinicManager?.certificate_image_url || null,
            password_hash: passwordHash,
            email1: dto.contact.email1,
            manager_address: managerAddress, // Manager address (bitta string)
            responsible_products: finalProducts,
            position: dto.manager.position || existingClinicManager?.position || null,
            status: "ACTIVE", // Immediately ACTIVE after signup (no approval needed)
            created_by: "self", // Self-registered manager
          },
        });

        // 12. Agar ClinicSupplierManager topilsa, unga link qo'shish
        if (existingClinicManager) {
          await tx.clinicSupplierManager.update({
            where: { id: existingClinicManager.id },
            data: {
              // linkedManager relation orqali avtomatik link qilinadi
            },
          });

          // 12a. Create APPROVED trade link for all clinics that have this ClinicSupplierManager
          // NOTE: ClinicSupplierLink is in clinic-backend database, not supplier-backend
          // This operation is optional - if it fails, registration continues
          try {
            // Find all ClinicSupplierManagers for this supplier
            const allClinicManagers = await tx.clinicSupplierManager.findMany({
              where: {
                supplier_id: supplier.id,
              },
              select: {
                tenant_id: true,
              },
            });

            // Create APPROVED trade links for all clinics
            // IMPORTANT: ClinicSupplierLink now links to SupplierManager, not Supplier
            // NOTE: This model exists in clinic-backend, not supplier-backend
            // If clinicSupplierLink is not available, skip this step
            if (tx.clinicSupplierLink && typeof tx.clinicSupplierLink.upsert === 'function') {
              const uniqueTenantIds = [...new Set(allClinicManagers.map((cm: any) => cm.tenant_id))];
              for (const tenantId of uniqueTenantIds) {
                await tx.clinicSupplierLink.upsert({
                  where: {
                    tenant_id_supplier_manager_id: {
                      tenant_id: tenantId,
                      supplier_manager_id: manager.id, // Use SupplierManager ID, not Supplier ID
                    },
                  },
                  update: {
                    status: "APPROVED", // Auto-approve if clinic already has manager
                    approved_at: new Date(),
                    updated_at: new Date(),
                  },
                  create: {
                    tenant_id: tenantId,
                    supplier_manager_id: manager.id, // Use SupplierManager ID, not Supplier ID
                    status: "APPROVED",
                    approved_at: new Date(),
                  },
                });
              }
              this.logger.log(`Created APPROVED trade links for ${uniqueTenantIds.length} clinic(s)`);
            } else {
              this.logger.warn('ClinicSupplierLink model is not available in supplier-backend database. Skipping trade link creation.');
            }
          } catch (linkError: any) {
            // Log error but don't fail registration - trade links can be created later via clinic-backend
            this.logger.warn(`Failed to create trade links: ${linkError?.message || 'Unknown error'}. Registration will continue.`);
            this.logger.warn('Trade links can be created later via clinic-backend API if needed.');
          }
        }

        // 13. Create region tags
        // TODO: Create SupplierRegionTag model in Prisma schema
        // for (const region of finalRegions) {
        //   await tx.supplierRegionTag.upsert({
        //     where: { name: region },
        //     update: {},
        //     create: { name: region },
        //   });
        // }

        // 14. Create product tags
        // TODO: Create SupplierProductTag model in Prisma schema
        // for (const product of finalProducts) {
        //   await tx.supplierProductTag.upsert({
        //     where: { name: product },
        //     update: {},
        //     create: { name: product },
        //   });
        // }

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
      }); // End of transaction
    }); // End of executeWithRetry
  }

  /**
   * Get manager profile with supplier information
   */
  async getProfile(supplierManagerId: string) {
    const manager = await this.prisma.supplierManager.findUnique({
      where: { id: supplierManagerId },
      include: {
        supplier: {
          select: {
            id: true,
            tenant_id: true,
            company_name: true,
            business_number: true,
            company_phone: true,
            company_email: true,
            company_address: true,
            product_categories: true,
          },
        },
      },
    });

    if (!manager) {
      throw new NotFoundException("Manager not found");
    }

    if (manager.status === "deleted") {
      throw new UnauthorizedException("This account has been withdrawn");
    }

    const managerData = manager as any;
    return {
      manager: {
        id: manager.id,
        manager_id: manager.manager_id,
        name: manager.name,
        phone_number: manager.phone_number,
        email1: manager.email1,
        position: manager.position,
        manager_address: manager.manager_address,
        responsible_products: manager.responsible_products,
        public_contact_name: managerData.public_contact_name ?? false,
        allow_hospital_search: managerData.allow_hospital_search ?? false,
        receive_kakaotalk: managerData.receive_kakaotalk ?? false,
        receive_sms: managerData.receive_sms ?? false,
        receive_email: managerData.receive_email ?? false,
        status: manager.status,
        created_at: manager.created_at,
      },
      supplier: manager.supplier,
    };
  }

  /**
   * Change password
   */
  async changePassword(
    supplierManagerId: string,
    currentPassword: string,
    newPassword: string
  ) {
    const manager = await this.prisma.supplierManager.findUnique({
      where: { id: supplierManagerId },
      select: {
        id: true,
        password_hash: true,
        status: true,
      },
    });

    if (!manager) {
      throw new NotFoundException("Manager not found");
    }

    if (manager.status === "deleted") {
      throw new UnauthorizedException("This account has been withdrawn");
    }

    if (!manager.password_hash) {
      throw new BadRequestException("Password is not set");
    }

    // Verify current password
    const isPasswordValid = await compare(currentPassword, manager.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    // Validate new password
    if (newPassword.length < 6) {
      throw new BadRequestException("New password must be at least 6 characters");
    }

    // Hash new password
    const newPasswordHash = await hash(newPassword, 10);

    // Update password
    await this.prisma.supplierManager.update({
      where: { id: supplierManagerId },
      data: {
        password_hash: newPasswordHash,
        updated_at: new Date(),
      },
    });

    return {
      message: "Password changed successfully",
    };
  }

  /**
   * Update manager profile
   */
  async updateProfile(
    supplierManagerId: string,
    data: { position?: string; phone_number?: string }
  ) {
    const manager = await this.prisma.supplierManager.findUnique({
      where: { id: supplierManagerId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!manager) {
      throw new NotFoundException("Manager not found");
    }

    if (manager.status === "deleted") {
      throw new UnauthorizedException("This account has been withdrawn");
    }

    // Validate phone number format if provided
    if (data.phone_number) {
      const cleanPhone = data.phone_number.replace(/[^0-9]/g, "");
      if (cleanPhone.length < 10 || cleanPhone.length > 11) {
        throw new BadRequestException(
          "올바른 전화번호 형식을 입력하세요 (예: 01012345678)"
        );
      }

      // Check if phone number is already used by another manager
      const existingManager = await this.prisma.supplierManager.findFirst({
        where: {
          phone_number: cleanPhone,
          id: { not: supplierManagerId },
        },
      });

      if (existingManager) {
        throw new ConflictException("이미 사용 중인 전화번호입니다");
      }

      data.phone_number = cleanPhone; // Store without dashes
    }

    // Validate position if provided
    if (data.position) {
      const validPositions = ["사원", "주임", "대리", "과장", "차장", "부장"];
      if (!validPositions.includes(data.position)) {
        throw new BadRequestException(
          `올바른 직함을 선택하세요: ${validPositions.join(", ")}`
        );
      }
    }

    // Update manager
    const updateData: any = {
      updated_at: new Date(),
    };

    if (data.position !== undefined) {
      updateData.position = data.position;
    }

    if (data.phone_number !== undefined) {
      updateData.phone_number = data.phone_number;
    }

    const updatedManager = await this.prisma.supplierManager.update({
      where: { id: supplierManagerId },
      data: updateData,
      select: {
        id: true,
        position: true,
        phone_number: true,
      },
    });

    return {
      message: "프로필이 업데이트되었습니다",
      manager: updatedManager,
    };
  }

  /**
   * Change affiliation (update supplier company information)
   */
  async changeAffiliation(
    supplierManagerId: string,
    data: {
      company_name: string;
      business_number: string;
      company_phone: string;
      company_email: string;
      company_address?: string;
      product_categories: string[];
      certificate_image_url?: string;
    }
  ) {
    const manager = await this.prisma.supplierManager.findUnique({
      where: { id: supplierManagerId },
      include: {
        supplier: true,
      },
    });

    if (!manager) {
      throw new NotFoundException("Manager not found");
    }

    if (manager.status === "deleted") {
      throw new UnauthorizedException("This account has been withdrawn");
    }

    // Validate required fields
    if (!data.company_name || !data.business_number || !data.company_phone || !data.company_email) {
      throw new BadRequestException("회사명, 사업자등록번호, 회사 전화번호, 회사 이메일은 필수입니다");
    }

    // Validate business number format (10 digits)
    const cleanBusinessNumber = data.business_number.replace(/[^0-9]/g, "");
    if (cleanBusinessNumber.length !== 10) {
      throw new BadRequestException("사업자등록번호는 10자리 숫자여야 합니다");
    }

    // Validate phone number format
    const cleanPhone = data.company_phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      throw new BadRequestException("올바른 전화번호 형식을 입력하세요");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.company_email)) {
      throw new BadRequestException("올바른 이메일 형식을 입력하세요");
    }

    // Check if business number is already used by another supplier
    const existingSupplier = await this.prisma.supplier.findFirst({
      where: {
        business_number: cleanBusinessNumber,
        id: { not: manager.supplier.id },
      },
    });

    if (existingSupplier) {
      throw new ConflictException("이미 사용 중인 사업자등록번호입니다");
    }

    // Check if email is already used by another supplier
    const existingSupplierByEmail = await this.prisma.supplier.findFirst({
      where: {
        company_email: data.company_email,
        id: { not: manager.supplier.id },
      },
    });

    if (existingSupplierByEmail) {
      throw new ConflictException("이미 사용 중인 이메일입니다");
    }

    // Update supplier information
    const updateData: any = {
      company_name: data.company_name,
      business_number: cleanBusinessNumber,
      company_phone: cleanPhone,
      company_email: data.company_email,
      company_address: data.company_address || null,
      product_categories: data.product_categories || [],
      updated_at: new Date(),
    };

    // If certificate is provided, update it (OCR will be done later)
    if (data.certificate_image_url) {
      // For now, just store the URL. OCR processing can be added later
      // You might want to store this in SupplierManager or Supplier model
      // For now, we'll skip it as it's not in the schema
    }

    const updatedSupplier = await this.prisma.supplier.update({
      where: { id: manager.supplier.id },
      data: updateData,
      select: {
        id: true,
        company_name: true,
        business_number: true,
        company_phone: true,
        company_email: true,
        company_address: true,
        product_categories: true,
      },
    });

    return {
      message: "소속 정보가 변경되었습니다. 관리자 승인이 필요할 수 있습니다.",
      supplier: updatedSupplier,
    };
  }

  /**
   * Withdraw (soft delete) manager account
   */
  async withdraw(
    supplierManagerId: string,
    password: string,
    withdrawalReason?: string
  ) {
    const manager = await this.prisma.supplierManager.findUnique({
      where: { id: supplierManagerId },
      select: {
        id: true,
        status: true,
        password_hash: true,
      },
    });

    if (!manager) {
      throw new NotFoundException("Manager not found");
    }

    if (manager.status === "deleted") {
      throw new BadRequestException("Account is already withdrawn");
    }

    if (!manager.password_hash) {
      throw new BadRequestException("Password is not set");
    }

    // Verify password
    const isPasswordValid = await compare(password, manager.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Password is incorrect");
    }

    // Soft delete - set status to 'deleted' and save withdrawal reason
    const updateData: any = {
      status: "deleted",
      updated_at: new Date(),
    };
    
    if (withdrawalReason) {
      updateData.withdrawal_reason = withdrawalReason;
    }

    await this.prisma.supplierManager.update({
      where: { id: supplierManagerId },
      data: updateData,
    });

    return {
      message: "Account withdrawn successfully",
    };
  }

  /**
   * Send customer service inquiry via SMS
   */
  async sendCustomerServiceInquiry(
    supplierManagerId: string,
    memo: string
  ): Promise<{ message: string }> {
    // Validate memo is not empty
    if (!memo || memo.trim().length === 0) {
      throw new BadRequestException("문의 내용을 입력해주세요.");
    }

    // Get manager and supplier information
    const manager = await this.prisma.supplierManager.findUnique({
      where: { id: supplierManagerId },
      include: { supplier: true },
    });

    if (!manager) {
      throw new NotFoundException("Manager not found");
    }

    // Get customer service phone number from environment
    const customerServicePhone = this.configService.get<string>(
      "CUSTOMER_SERVICE_PHONE"
    ) || "01021455662"; // Fallback to default

    // Format SMS message
    const companyName = manager.supplier.company_name || "—";
    const managerName = manager.name || "—";
    const managerPhone = manager.phone_number || "—";
    const inquiryMemo = memo.trim();

    const smsMessage = `고객센터 메시지

회사명: ${companyName}
이름: ${managerName}
연락처: ${managerPhone}
문의 내용: ${inquiryMemo}`;

    // Send SMS
    const smsSent = await this.solapiProvider.sendSMS(
      customerServicePhone,
      smsMessage
    );

    if (!smsSent) {
      this.logger.error(
        `Failed to send customer service inquiry SMS to ${customerServicePhone}`
      );
      throw new BadRequestException(
        "문의 메시지 전송에 실패했습니다. 잠시 후 다시 시도해주세요."
      );
    }

    this.logger.log(
      `Customer service inquiry sent from ${managerName} (${managerPhone}) to ${customerServicePhone}`
    );

    return {
      message: "문의가 성공적으로 전송되었습니다.",
    };
  }
}

