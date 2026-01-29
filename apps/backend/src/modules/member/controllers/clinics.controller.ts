import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { join } from "path";
import { promises as fs } from "fs";
import { ClinicsService } from "../services/clinics.service";
import { RegisterClinicDto } from "../dto/register-clinic.dto";
import { UpdateClinicLogoDto } from "../dto/update-clinic-logo.dto";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { Tenant } from "../../../common/decorators/tenant.decorator";
import { ReqUser } from "../../../common/decorators/req-user.decorator";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { getSerialForImage, validMimeTypes } from "../../../common/utils/upload.utils";
import type { Request } from "express";

@ApiTags("membership")
@ApiBearerAuth()
@Controller("iam/members/clinics")
// @UseGuards(JwtTenantGuard, RolesGuard) TODO: Create guard for clinic register
export class ClinicsController {
  constructor(private readonly service: ClinicsService) {}

  @Get()
  @UseGuards(JwtTenantGuard, RolesGuard)
  @Roles("owner")
  @ApiOperation({ summary: "Retrieve clinics for the tenant (owner only)" })
  getClinics(
    @Tenant() tenantId: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    // For registration flow, use tenantId from query parameter
    // For authenticated users, tenantId comes from JWT token via @Tenant() decorator
    const resolvedTenantId = tenantId ?? tenantQuery ?? "self-service-tenant";
    if (!resolvedTenantId) {
      throw new BadRequestException("tenant_id is required");
    }
    return this.service.getClinics(resolvedTenantId);
  }

  @Get("info")
@UseGuards(JwtTenantGuard) // ✅ Faqat authentication, role check yo'q
@ApiOperation({ summary: "Get clinic basic info (name and logo) for all authenticated users" })
getClinicInfo(
  @Tenant() tenantId: string,
  @Query("tenantId") tenantQuery?: string
) {
  const resolvedTenantId = tenantId ?? tenantQuery ?? "self-service-tenant";
  if (!resolvedTenantId) {
    throw new BadRequestException("tenant_id is required");
  }
  return this.service.getClinicInfo(resolvedTenantId);
}

  @Post()
  @ApiOperation({ summary: "Register a clinic for the tenant" })
  @Roles("admin", "manager")
  clinicRegister(
    @Body() dto: RegisterClinicDto,
    @Tenant() tenantId: string,
    @ReqUser("id") userId: string
  ) {
    // Generate unique tenant_id if not provided (new clinic registration)
    const resolvedTenantId = tenantId ?? dto.tenantId ?? this.generateUniqueTenantId();
    if (!resolvedTenantId) {
      throw new BadRequestException("tenant_id is required");
    }
    const resolvedUserId = userId ?? dto.createdBy ?? "self-service";
    return this.service.clinicRegister(dto, resolvedTenantId, resolvedUserId);
  }

  /**
   * Generate unique tenant ID for new clinic
   * Format: clinic_<timestamp>_<random>
   * Example: clinic_1704348000000_a3b5c7d9
   */
  private generateUniqueTenantId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `clinic_${timestamp}_${random}`;
  }

  @Put()
  @UseGuards(JwtTenantGuard)
  @ApiOperation({ summary: "Update clinic settings by tenant ID" })
  updateClinicSettings(
    @Body() dto: { allow_company_search?: boolean; allow_info_disclosure?: boolean },
    @Tenant() tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("tenant_id is required");
    }
    return this.service.updateClinicSettings(tenantId, dto);
  }

  @Put("logo")
  @UseGuards(JwtTenantGuard, RolesGuard)
  @Roles("owner")
  @ApiOperation({ summary: "Update clinic logo URL" })
  async updateLogo(
    @Body() dto: UpdateClinicLogoDto,
    @Tenant() tenantId?: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    const resolvedTenantId = tenantId ?? tenantQuery ?? "self-service-tenant";
    
    try {
      const result = await this.service.updateClinicLogo(resolvedTenantId, dto.logoUrl);
      return result;
    } catch (error) {
      console.error("Update logo service error:", {
        error,
        message: (error instanceof Error) ? error.message : undefined,
        tenantId: resolvedTenantId,
        logoUrl: dto.logoUrl,
      });
      throw error;
    }
  }

  @Put(":id")
  @ApiOperation({ summary: "Update a clinic" })
  updateClinic(
    @Param("id") id: string,
    @Body() dto: RegisterClinicDto,
    @Tenant() tenantId: string,
    @ReqUser("id") userId: string
  ) {
    const resolvedTenantId = tenantId ?? dto.tenantId ?? "self-service-tenant";
    if (!resolvedTenantId) {
      throw new BadRequestException("tenant_id is required");
    }
    const resolvedUserId = userId ?? dto.createdBy ?? "self-service";
    return this.service.updateClinic(id, dto, resolvedTenantId, resolvedUserId);
  }

  @Post("upload-certificate")
  @ApiOperation({ summary: "Upload clinic certificate image" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: async (
          req: Request,
          file: Express.Multer.File,
          callback: (error: Error | null, destination: string) => void
        ) => {
          const tenantId = (req as any).tenantId || (req.query?.tenantId as string) || "self-service-tenant";
          const UPLOAD_ROOT = join(process.cwd(), "uploads");
          const targetDir = join(UPLOAD_ROOT, "clinic", tenantId);
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
          const filename = getSerialForImage(file.originalname);
          callback(null, filename);
        },
      }),
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, acceptFile: boolean) => void
      ) => {
        const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!validTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(`Invalid file type. Allowed types: ${validTypes.join(", ")}`),
            false
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    })
  )
  async uploadCertificate(
    @UploadedFile() file: Express.Multer.File,
    @Tenant() tenantId?: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    if (!file) {
      throw new BadRequestException("File is required");
    }

    const resolvedTenantId = tenantId ?? tenantQuery ?? "self-service-tenant";
    const url = `/uploads/clinic/${resolvedTenantId}/${file.filename}`;

    return {
      filename: file.filename,
      url,
      category: "clinic",
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  @Post("verify-certificate")
  @ApiOperation({ 
    summary: "Verify clinic certificate using OCR",
    description: "Upload file directly or provide fileUrl from previous upload"
  })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: undefined, // Use memory storage to get buffer
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (req, file, callback) => {
        // Allow file to be optional if fileUrl is provided
        if (!file && !req.query?.fileUrl) {
          return callback(
            new BadRequestException("Either file or fileUrl query parameter is required"),
            false
          );
        }
        if (file) {
          const validMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
          if (!validMimeTypes.includes(file.mimetype)) {
            return callback(
              new BadRequestException(
                `Invalid file type. Allowed types: ${validMimeTypes.join(", ")}`
              ),
              false
            );
          }
        }
        callback(null, true);
      },
    })
  )
  async verifyCertificate(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("fileUrl") fileUrl?: string,
    @Tenant() tenantId?: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    const resolvedTenantId = tenantId ?? tenantQuery ?? "self-service-tenant";

    let buffer: Buffer;
    let mimetype: string | undefined;

    // Option 1: File uploaded directly
    if (file) {
      if (file.buffer) {
        buffer = file.buffer;
        mimetype = file.mimetype;
      } else if (file.path) {
        const fs = await import("fs/promises");
        buffer = await fs.readFile(file.path);
        mimetype = file.mimetype;
      } else {
        throw new BadRequestException("Unable to read file content");
      }
    }
    // Option 2: File URL provided (from previous upload)
    else if (fileUrl) {
      try {
        const filePath = join(process.cwd(), fileUrl);
        buffer = await fs.readFile(filePath);
        // Try to detect mimetype from file extension
        const ext = fileUrl.split(".").pop()?.toLowerCase();
        if (ext === "png") mimetype = "image/png";
        else if (ext === "jpg" || ext === "jpeg") mimetype = "image/jpeg";
        else if (ext === "webp") mimetype = "image/webp";
        else mimetype = "image/jpeg"; // default
      } catch (error) {
        throw new BadRequestException(`Failed to read file from URL: ${fileUrl}`);
      }
    } else {
      throw new BadRequestException("Either file or fileUrl query parameter is required");
    }

    return this.service.verifyCertificate(buffer, resolvedTenantId, mimetype);
  }

  @Post("upload-logo")
  @UseGuards(JwtTenantGuard, RolesGuard)
  @Roles("owner")
  @ApiOperation({ summary: "Upload clinic logo image" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: async (
          req: Request,
          file: Express.Multer.File,
          callback: (error: Error | null, destination: string) => void
        ) => {
          const tenantId = (req as any).tenantId || (req.query?.tenantId as string) || "self-service-tenant";
          const UPLOAD_ROOT = join(process.cwd(), "uploads");
          const targetDir = join(UPLOAD_ROOT, "clinic", tenantId, "logo");
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
          const filename = getSerialForImage(file.originalname);
          callback(null, filename);
        },
      }),
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, acceptFile: boolean) => void
      ) => {
        const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!validTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(`Invalid file type. Allowed types: ${validTypes.join(", ")}`),
            false
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    })
  )
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @Tenant() tenantId?: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    if (!file) {
      throw new BadRequestException("File is required");
    }

    const resolvedTenantId = tenantId ?? tenantQuery ?? "self-service-tenant";
    const url = `/uploads/clinic/${resolvedTenantId}/logo/${file.filename}`;

    return {
      filename: file.filename,
      url,
      category: "clinic-logo",
      size: file.size,
      mimetype: file.mimetype,
    };
  }
}

