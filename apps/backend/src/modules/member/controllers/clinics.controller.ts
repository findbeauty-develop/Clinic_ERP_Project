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
import type { Request } from "express";
import {
  buildClinicStoragePath,
  buildClinicUploadResponse,
  clinicImageFileInterceptor,
  resolveCertificateFileInput,
  resolveOptionalTenantId,
  SELF_SERVICE_TENANT,
  throwClinicUploadFailed,
} from "./clinics.controller.utils";

const CERTIFICATE_UPLOAD_INTERCEPTOR = clinicImageFileInterceptor({
  maxFileSizeBytes: 10 * 1024 * 1024,
});
const VERIFY_CERTIFICATE_INTERCEPTOR = clinicImageFileInterceptor({
  maxFileSizeBytes: 10 * 1024 * 1024,
  optionalFileIfFileUrlQuery: true,
});
const LOGO_UPLOAD_INTERCEPTOR = clinicImageFileInterceptor({
  maxFileSizeBytes: 5 * 1024 * 1024,
});

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
  @SetMetadata("skipJwtGuard", true)
  @ApiOperation({
    summary:
      "Retrieve clinics for the tenant (public with tenantId query param, or authenticated)",
  })
  async getClinics(
    @Req() req: Request,
    @Query("tenantId") tenantQuery?: string,
    @Query("tenant_id") tenant_id?: string
  ) {
    const tenantFromQuery = tenantQuery ?? tenant_id;
    const auth = (req.headers.authorization as string) || undefined;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.split(" ")[1];
      const fromSupabase = await this.tryResolveGetClinicsTenantViaSupabase(
        req,
        token
      );
      if (fromSupabase) {
        return this.service.getClinics(fromSupabase);
      }
      const fromMemberJwt = this.tryResolveGetClinicsTenantViaMemberJwt(
        req,
        token
      );
      if (fromMemberJwt) {
        return this.service.getClinics(fromMemberJwt);
      }
    }

    if (!tenantFromQuery) {
      throw new BadRequestException(
        "tenant_id query parameter is required for registration flow"
      );
    }
    return this.service.getClinics(tenantFromQuery);
  }

  /**
   * Supabase session token bo‘lsa, `req.user` / `req.tenantId` to‘ldiriladi.
   * @returns tenantId yoki null (keyingi JWT yoki query flow uchun).
   */
  private async tryResolveGetClinicsTenantViaSupabase(
    req: Request,
    token: string
  ): Promise<string | null> {
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
          return tenantId;
        }
      }
    } catch {
      // Network / Supabase errors — fall through to member JWT
    }
    return null;
  }

  /**
   * Member JWT bo‘lsa, `req.user` / `req.tenantId` to‘ldiriladi.
   */
  private tryResolveGetClinicsTenantViaMemberJwt(
    req: Request,
    token: string
  ): string | null {
    const secret =
      process.env.MEMBER_JWT_SECRET ??
      process.env.SUPABASE_JWT_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) {
      return null;
    }
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
        return tenantId;
      }
    } catch {
      // Invalid token — registration flow or tenantId query below
    }
    return null;
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
    const resolvedTenantId = resolveOptionalTenantId(
      tenantId,
      tenantQuery,
      SELF_SERVICE_TENANT
    );
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
    const resolvedTenantId = resolveOptionalTenantId(
      tenantId,
      tenantQuery,
      SELF_SERVICE_TENANT
    );
    try {
      return await this.service.updateClinicLogo(resolvedTenantId, dto.logoUrl);
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
    const resolvedTenantId = resolveOptionalTenantId(
      tenantId,
      dto.tenantId,
      SELF_SERVICE_TENANT
    );
    if (!resolvedTenantId) {
      throw new BadRequestException("tenant_id is required");
    }
    const resolvedUserId = userId ?? dto.createdBy ?? "self-service";
    return this.service.updateClinic(id, dto, resolvedTenantId, resolvedUserId);
  }

  @Post("upload-certificate")
  @ApiOperation({ summary: "Upload clinic certificate image" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(CERTIFICATE_UPLOAD_INTERCEPTOR)
  async uploadCertificate(
    @UploadedFile() file: Express.Multer.File,
    @Tenant() tenantId?: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    if (!file) {
      throw new BadRequestException("File is required");
    }
    const resolvedTenantId = resolveOptionalTenantId(
      tenantId,
      tenantQuery,
      SELF_SERVICE_TENANT
    );
    const storagePath = buildClinicStoragePath(
      "certificate",
      resolvedTenantId,
      file.originalname
    );
    try {
      const publicUrl = await this.service.uploadToStorage(file, storagePath, {
        optimize: true,
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 90,
      });
      return buildClinicUploadResponse(storagePath, publicUrl, "clinic", file);
    } catch (error: unknown) {
      throwClinicUploadFailed(error);
    }
  }

  @Post("verify-certificate")
  @ApiOperation({
    summary: "Verify clinic certificate using OCR",
    description: "Upload file directly or provide fileUrl from previous upload",
  })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(VERIFY_CERTIFICATE_INTERCEPTOR)
  async verifyCertificate(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("fileUrl") fileUrl?: string,
    @Tenant() tenantId?: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    const resolvedTenantId = resolveOptionalTenantId(
      tenantId,
      tenantQuery,
      SELF_SERVICE_TENANT
    );
    const { buffer, mimetype } = await resolveCertificateFileInput(
      file,
      fileUrl
    );
    return this.service.verifyCertificate(buffer, resolvedTenantId, mimetype);
  }

  @Post("upload-logo")
  @UseGuards(JwtTenantGuard, RolesGuard)
  @Roles("owner")
  @ApiOperation({ summary: "Upload clinic logo image" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(LOGO_UPLOAD_INTERCEPTOR)
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @Tenant() tenantId?: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    if (!file) {
      throw new BadRequestException("File is required");
    }
    const resolvedTenantId = resolveOptionalTenantId(
      tenantId,
      tenantQuery,
      SELF_SERVICE_TENANT
    );
    const storagePath = buildClinicStoragePath(
      "logo",
      resolvedTenantId,
      file.originalname
    );
    try {
      const publicUrl = await this.service.uploadToStorage(file, storagePath, {
        optimize: true,
        maxWidth: 500,
        maxHeight: 500,
        quality: 90,
      });
      return buildClinicUploadResponse(
        storagePath,
        publicUrl,
        "clinic-logo",
        file
      );
    } catch (error: unknown) {
      throwClinicUploadFailed(error);
    }
  }

  @Post("register/agree-terms")
  @SetMetadata("skipJwtGuard", true)
  @ApiOperation({
    summary:
      "Agree to terms of service for newly registered clinic (public endpoint)",
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
    summary:
      "Check if clinic already exists by document_issue_number or license_number (public endpoint)",
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
