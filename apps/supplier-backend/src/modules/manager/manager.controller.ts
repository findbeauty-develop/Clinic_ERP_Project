import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
  Req,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { join } from "path";
import { promises as fs } from "fs";
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from "@nestjs/swagger";
import { ManagerService } from "./manager.service";
import { RegisterManagerDto } from "./dto/register-manager.dto";
import { RegisterCompanyDto } from "./dto/register-company.dto";
import { RegisterContactDto } from "./dto/register-contact.dto";
import { RegisterCompleteDto } from "./dto/register-complete.dto";
import { GoogleVisionService } from "../../services/google-vision.service";
import { BusinessCertificateParserService } from "../../services/business-certificate-parser.service";
import { PhoneVerificationService } from "../../services/phone-verification.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { Request } from "express";

const UPLOAD_ROOT = join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

@ApiTags("supplier-manager")
@Controller("supplier/manager")
export class ManagerController {
  constructor(
    private readonly managerService: ManagerService,
    private readonly googleVisionService: GoogleVisionService,
    private readonly certificateParser: BusinessCertificateParserService,
    private readonly phoneVerificationService: PhoneVerificationService
  ) {}

  @Post("check-phone")
  @ApiOperation({ summary: "Check if phone number is already registered" })
  async checkPhone(@Body() body: { phoneNumber: string }) {
    const isDuplicate = await this.managerService.checkPhoneDuplicate(
      body.phoneNumber
    );
    return {
      isDuplicate,
      message: isDuplicate
        ? "이미 등록된 휴대폰 번호입니다"
        : "사용 가능한 휴대폰 번호입니다",
    };
  }

  @Post("upload-certificate")
  @ApiOperation({ summary: "Upload business registration certificate image" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: async (
          req: Request,
          file: Express.Multer.File,
          callback: (error: Error | null, destination: string) => void
        ) => {
          const targetDir = join(UPLOAD_ROOT, "supplier", "certificate");
          try {
            await fs.mkdir(targetDir, { recursive: true });
            callback(null, targetDir);
          } catch (error) {
            callback(error as Error, targetDir);
          }
        },
        filename: (
          req: Request,
          file: Express.Multer.File,
          callback: (error: Error | null, filename: string) => void
        ) => {
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 15);
          const ext = file.originalname.split(".").pop();
          const filename = `cert_${timestamp}_${randomStr}.${ext}`;
          callback(null, filename);
        },
      }),
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, acceptFile: boolean) => void
      ) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              `지원하지 않는 파일 형식입니다. 허용 형식: ${ALLOWED_MIME_TYPES.join(", ")}`
            ),
            false
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: MAX_FILE_SIZE,
      },
    })
  )
  async uploadCertificate(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("파일을 업로드하세요");
    }

    const fileUrl = `/uploads/supplier/certificate/${file.filename}`;
    const filePath = join(UPLOAD_ROOT, "supplier", "certificate", file.filename);

    // OCR processing
    let ocrResult = null;
    let ocrError = null;
    try {
      // Read file buffer for OCR
      const buffer = await fs.readFile(filePath);

      // Extract text using OCR
      const rawText = await this.googleVisionService.extractTextFromBuffer(buffer);

      // Parse fields from OCR text
      const parsedFields = this.certificateParser.parseBusinessCertificate(rawText);

      ocrResult = {
        rawText,
        parsedFields,
      };
    } catch (error) {
      // OCR failed, but continue with file upload
      ocrError = error instanceof Error ? error.message : String(error);
      console.error("OCR processing failed:", error);
      // Don't throw error, just continue without OCR result
    }

    return {
      message: ocrResult
        ? "파일 업로드 및 OCR 처리가 완료되었습니다"
        : "파일 업로드가 완료되었습니다",
      fileUrl,
      filename: file.filename,
      size: file.size,
      ocrResult,
      ocrError: ocrError || undefined, // Debug uchun error'ni ham qaytaramiz
    };
  }

  @Post("register")
  @ApiOperation({ summary: "Register new manager (pending company approval)" })
  async register(@Body() dto: RegisterManagerDto) {
    return this.managerService.registerManager(dto);
  }

  @Post("register-company")
  @ApiOperation({ summary: "Register company information (step 3)" })
  async registerCompany(@Body() dto: RegisterCompanyDto) {
    return this.managerService.registerCompany(dto);
  }

  @Post("register-contact")
  @ApiOperation({ summary: "Register contact person information (step 4)" })
  async registerContact(@Body() dto: RegisterContactDto) {
    return this.managerService.registerContact(dto);
  }

  @Post("register-complete")
  @ApiOperation({ summary: "Complete registration with all data (final step)" })
  async registerComplete(@Body() dto: RegisterCompleteDto) {
    try {
      console.log("🔵 [Controller] register-complete endpoint called");
      console.log("📦 [Controller] Received DTO:", JSON.stringify(dto, null, 2));
      const result = await this.managerService.registerComplete(dto);
      console.log("✅ [Controller] Registration completed successfully");
      return result;
    } catch (error: any) {
      console.error("❌ [Controller] register-complete failed:");
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      throw error; // Re-throw to let NestJS handle it
    }
  }

  @Get("profile")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get manager profile with supplier information" })
  async getProfile(@Req() req: Request & { user: any }) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    if (!supplierManagerId) {
      throw new BadRequestException("Manager ID not found in token");
    }
    return this.managerService.getProfile(supplierManagerId);
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change password" })
  async changePassword(
    @Body() body: { currentPassword: string; newPassword: string },
    @Req() req: Request & { user: any }
  ) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    if (!supplierManagerId) {
      throw new BadRequestException("Manager ID not found in token");
    }
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException("Current password and new password are required");
    }
    return this.managerService.changePassword(
      supplierManagerId,
      body.currentPassword,
      body.newPassword
    );
  }

  @Post("send-phone-verification")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Send phone verification code via SMS" })
  async sendPhoneVerification(
    @Body() body: { phone_number: string },
    @Req() req: Request & { user: any }
  ) {
    if (!body.phone_number) {
      throw new BadRequestException("Phone number is required");
    }
    return this.phoneVerificationService.sendVerificationCode(body.phone_number);
  }

  @Post("verify-phone-code")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Verify phone verification code" })
  async verifyPhoneCode(
    @Body() body: { phone_number: string; code: string },
    @Req() req: Request & { user: any }
  ) {
    if (!body.phone_number || !body.code) {
      throw new BadRequestException("Phone number and code are required");
    }
    return this.phoneVerificationService.verifyCode(body.phone_number, body.code);
  }

  @Put("profile")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update manager profile" })
  async updateProfile(
    @Body() body: {
      position?: string;
      phone_number?: string;
      public_contact_name?: boolean;
      allow_hospital_search?: boolean;
      receive_kakaotalk?: boolean;
      receive_sms?: boolean;
      receive_email?: boolean;
    },
    @Req() req: Request & { user: any }
  ) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    if (!supplierManagerId) {
      throw new BadRequestException("Manager ID not found in token");
    }
    
    // If phone_number is being updated, verify it first
    if (body.phone_number) {
      const isVerified = await this.phoneVerificationService.isPhoneVerified(body.phone_number);
      if (!isVerified) {
        throw new BadRequestException("전화번호 인증이 완료되지 않았습니다. 인증번호를 확인해주세요.");
      }
    }
    
    return this.managerService.updateProfile(supplierManagerId, body);
  }

  @Put("change-affiliation")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change supplier affiliation (update company information)" })
  async changeAffiliation(
    @Body() body: {
      company_name: string;
      business_number: string;
      company_phone: string;
      company_email: string;
      company_address?: string;
      product_categories: string[];
      certificate_image_url?: string;
    },
    @Req() req: Request & { user: any }
  ) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    if (!supplierManagerId) {
      throw new BadRequestException("Manager ID not found in token");
    }
    return this.managerService.changeAffiliation(supplierManagerId, body);
  }

  @Delete("withdraw")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Withdraw (soft delete) manager account" })
  async withdraw(
    @Body() body: { password: string; withdrawal_reason?: string },
    @Req() req: Request & { user: any }
  ) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    if (!supplierManagerId) {
      throw new BadRequestException("Manager ID not found in token");
    }
    if (!body.password) {
      throw new BadRequestException("Password is required");
    }
    return this.managerService.withdraw(
      supplierManagerId,
      body.password,
      body.withdrawal_reason
    );
  }

  @Post("contact-support")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Send customer service inquiry via SMS" })
  async contactSupport(
    @Body() body: { memo: string },
    @Req() req: Request & { user: any }
  ) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    if (!supplierManagerId) {
      throw new BadRequestException("Manager ID not found in token");
    }
    if (!body.memo || body.memo.trim().length === 0) {
      throw new BadRequestException("문의 내용을 입력해주세요.");
    }
    return this.managerService.sendCustomerServiceInquiry(
      supplierManagerId,
      body.memo
    );
  }

  @Get("clinics")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get clinics linked to this supplier manager" })
  async getClinics(@Req() req: Request & { user: any }) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    if (!supplierManagerId) {
      throw new BadRequestException("Manager ID not found in token");
    }
    return this.managerService.getClinicsForSupplier(supplierManagerId);
  }

  @Put("clinic/:tenantId/memo")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update memo for a clinic" })
  async updateClinicMemo(
    @Param("tenantId") tenantId: string,
    @Body() body: { memo: string },
    @Req() req: Request & { user: any }
  ) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    if (!supplierManagerId) {
      throw new BadRequestException("Manager ID not found in token");
    }
    return this.managerService.updateClinicMemo(tenantId, supplierManagerId, body.memo || null);
  }
}

