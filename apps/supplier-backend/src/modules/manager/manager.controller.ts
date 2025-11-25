import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { join } from "path";
import { promises as fs } from "fs";
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from "@nestjs/swagger";
import { ManagerService } from "./manager.service";
import { RegisterManagerDto } from "./dto/register-manager.dto";
import { RegisterCompanyDto } from "./dto/register-company.dto";
import { RegisterContactDto } from "./dto/register-contact.dto";
import { GoogleVisionService } from "../../services/google-vision.service";
import { BusinessCertificateParserService } from "../../services/business-certificate-parser.service";
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
    private readonly certificateParser: BusinessCertificateParserService
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
}

