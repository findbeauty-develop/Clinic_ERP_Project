import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  SetMetadata,
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
import { SupabaseService } from "../../../common/supabase.service";
import { JwtPayload, verify } from "jsonwebtoken";
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  getSerialForImage,
  getUploadRoot,
  validMimeTypes,
} from "../../../common/utils/upload.utils";
import type { Request } from "express";

@ApiTags("membership")
@ApiBearerAuth()
@Controller("iam/members/clinics")
// @UseGuards(JwtTenantGuard, RolesGuard) TODO: Create guard for clinic register
export class ClinicsController {
  constructor(
    private readonly service: ClinicsService,
    private readonly supabaseService: SupabaseService
  ) {}

  @Get()
  @SetMetadata("skipJwtGuard", true) // ✅ JWT guard'ni optional qilish - registration flow uchun
  @ApiOperation({ 
    summary: "Retrieve clinics for the tenant (public with tenantId query param, or authenticated)" 
  })
  async getClinics(
    @Req() req: Request,
    @Query("tenantId") tenantQuery?: string,
    @Query("tenant_id") tenant_id?: string
  ) {
    const tenantFromQuery = tenantQuery ?? tenant_id;
    // ✅ Security: Manual token validation - agar token bo'lsa, validate qilish
    const auth = (req.headers.authorization as string) || undefined;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.split(" ")[1];

      // Supabase first (same order as JwtTenantGuard)
      try {
        const { data, error } = await this.supabaseService.getUser(token);
        if (!error && data?.user) {
          let tenantId = (data.user.user_metadata as any)?.tenant_id;
          if (!tenantId) {
            tenantId = (req.headers["x-tenant-id"] as string) || undefined;
          }

          if (tenantId) {
            (req as any).user = {
              id: data.user.id,
              email: data.user.email,
              roles: (data.user.user_metadata as any)?.roles ?? [],
            };
            (req as any).tenantId = tenantId;
            return this.service.getClinics(tenantId);
          }
        }
      } catch {
        // Network / Supabase errors — fall through to member JWT (do not require query param)
      }

      // Member JWT when token is not a Supabase session (Supabase often returns { error } without throwing)
      const secret =
        process.env.MEMBER_JWT_SECRET ??
        process.env.SUPABASE_JWT_SECRET ??
        process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (secret) {
        try {
          const payload = verify(token, secret) as JwtPayload & {
            tenant_id?: string;
            tenantId?: string;
            roles?: string[];
            member_id?: string;
          };

          let tenantId = payload.tenant_id ?? payload.tenantId;
          if (!tenantId) {
            tenantId = (req.headers["x-tenant-id"] as string) || undefined;
          }

          if (tenantId) {
            (req as any).user = {
              id: (payload.sub as string) ?? payload.member_id ?? "member",
              member_id: payload.member_id,
              email: (payload as any)?.email ?? null,
              roles: payload.roles ?? [],
              tenant_id: tenantId,
              clinic_name: (payload as any)?.clinic_name,
              must_change_password: (payload as any)?.must_change_password,
            };
            (req as any).tenantId = tenantId;
            return this.service.getClinics(tenantId);
          }
        } catch {
          // Invalid token — registration flow or tenantId query below
        }
      }
    }
    
    // ✅ Registration flow - query parameter'dan tenantId olish
    // Token yo'q yoki invalid bo'lsa, faqat query parameter'dan tenantId olish
    if (!tenantFromQuery) {
      throw new BadRequestException("tenant_id query parameter is required for registration flow");
    }

    // Registration flow uchun query parameter'dan kelgan tenantId'ni ishlatish
    return this.service.getClinics(tenantFromQuery);
  }

  @Get("info")
  @UseGuards(JwtTenantGuard) // ✅ Faqat authentication, role check yo'q
  @ApiOperation({
    summary:
      "Get clinic basic info (name and logo) for all authenticated users",
  })
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
    // Generate unique tenant_id if not provided (new clinic registration); englishName aralashadi
    const resolvedTenantId =
      tenantId ?? dto.tenantId ?? this.generateUniqueTenantId(dto.englishName);
    if (!resolvedTenantId) {
      throw new BadRequestException("tenant_id is required");
    }
    const resolvedUserId = userId ?? dto.createdBy ?? "self-service";
    return this.service.clinicRegister(dto, resolvedTenantId, resolvedUserId);
  }

  /**
   * Slug for tenant_id: only a-z, 0-9, underscore; max 24 chars.
   */
  private slugForTenantId(name: string, maxLen = 24): string {
    const slug = (name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .substring(0, maxLen);
    return slug || "clinic";
  }

  /**
   * Generate unique tenant ID for new clinic.
   * Format: clinic_<englishName_slug>_<timestamp>_<random>
   * Example: clinic_abc_medical_1704348000000_a3b5c7d9
   */
  private generateUniqueTenantId(englishName?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const slug = englishName ? this.slugForTenantId(englishName) : "";
    const mid = slug ? `${slug}_` : "";
    return `clinic_${mid}${timestamp}_${random}`;
  }

  @Put()
  @UseGuards(JwtTenantGuard)
  @ApiOperation({ summary: "Update clinic settings by tenant ID" })
  updateClinicSettings(
    @Body()
    dto: { allow_company_search?: boolean; allow_info_disclosure?: boolean },
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
      const result = await this.service.updateClinicLogo(
        resolvedTenantId,
        dto.logoUrl
      );
      return result;
    } catch (error) {
      console.error("Update logo service error:", {
        error,
        message: error instanceof Error ? error.message : undefined,
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
      storage: undefined, // Use memory storage
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, acceptFile: boolean) => void
      ) => {
        const validTypes = [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
        ];
        if (!validTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              `Invalid file type. Allowed types: ${validTypes.join(", ")}`
            ),
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
    
    // Generate storage path for certificate
    const storagePath = `certificate/${resolvedTenantId}/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${file.originalname.split('.').pop()?.toLowerCase() || 'jpg'}`;

    try {
      // Upload to Supabase Storage
      const publicUrl = await this.service.uploadToStorage(file, storagePath, {
        optimize: true,
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 90,
      });

      return {
        filename: storagePath.split('/').pop(),
        url: publicUrl, // Return Supabase public URL
        category: "clinic",
        size: file.size,
        mimetype: file.mimetype,
      };
    } catch (error: any) {
      throw new BadRequestException(
        `Upload failed: ${error.message || "Unknown error"}`
      );
    }
  }

  @Post("verify-certificate")
  @ApiOperation({
    summary: "Verify clinic certificate using OCR",
    description: "Upload file directly or provide fileUrl from previous upload",
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
            new BadRequestException(
              "Either file or fileUrl query parameter is required"
            ),
            false
          );
        }
        if (file) {
          const validMimeTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
          ];
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
        const filePath = join(getUploadRoot(), fileUrl.replace(/^\/uploads\/?/, ""));
        buffer = await fs.readFile(filePath);
        // Try to detect mimetype from file extension
        const ext = fileUrl.split(".").pop()?.toLowerCase();
        if (ext === "png") mimetype = "image/png";
        else if (ext === "jpg" || ext === "jpeg") mimetype = "image/jpeg";
        else if (ext === "webp") mimetype = "image/webp";
        else mimetype = "image/jpeg"; // default
      } catch (error) {
        throw new BadRequestException(
          `Failed to read file from URL: ${fileUrl}`
        );
      }
    } else {
      throw new BadRequestException(
        "Either file or fileUrl query parameter is required"
      );
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
      storage: undefined, // Use memory storage
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, acceptFile: boolean) => void
      ) => {
        const validTypes = [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
        ];
        if (!validTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              `Invalid file type. Allowed types: ${validTypes.join(", ")}`
            ),
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
    
    // Generate storage path for logo
    const storagePath = `logo/${resolvedTenantId}/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${file.originalname.split('.').pop()?.toLowerCase() || 'jpg'}`;

    try {
      // Upload to Supabase Storage with optimization
      const publicUrl = await this.service.uploadToStorage(file, storagePath, {
        optimize: true,
        maxWidth: 500,
        maxHeight: 500,
        quality: 90,
      });

      return {
        filename: storagePath.split('/').pop(),
        url: publicUrl, // Return Supabase public URL
        category: "clinic-logo",
        size: file.size,
        mimetype: file.mimetype,
      };
    } catch (error: any) {
      throw new BadRequestException(
        `Upload failed: ${error.message || "Unknown error"}`
      );
    }
  }

  @Post("register/agree-terms")
  @SetMetadata("skipJwtGuard", true)
  @ApiOperation({
    summary: "Agree to terms of service for newly registered clinic (public endpoint)",
  })
  async agreeTermsOfService(@Body() dto: { clinicId: string }) {
    if (!dto.clinicId) {
      throw new BadRequestException("clinicId is required");
    }
    return this.service.agreeTermsOfService(dto.clinicId);
  }

  @Post("check-duplicate")
  @SetMetadata("skipJwtGuard", true)
  @ApiOperation({
    summary: "Check if clinic already exists by document_issue_number or license_number (public endpoint)",
  })
  async checkDuplicate(
    @Body() dto: { documentIssueNumber?: string; licenseNumber?: string }
  ) {
    if (!dto.documentIssueNumber && !dto.licenseNumber) {
      throw new BadRequestException(
        "documentIssueNumber or licenseNumber is required"
      );
    }
    return this.service.checkDuplicateClinic(
      dto.documentIssueNumber,
      dto.licenseNumber
    );
  }
}
