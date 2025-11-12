import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ClinicsService } from "../services/clinics.service";
import { RegisterClinicDto } from "../dto/register-clinic.dto";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { Tenant } from "../../../common/decorators/tenant.decorator";
import { ReqUser } from "../../../common/decorators/req-user.decorator";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("membership")
@ApiBearerAuth()
@Controller("iam/members/clinics")
// @UseGuards(JwtTenantGuard, RolesGuard) TODO: Create guard for clinic register
export class ClinicsController {
  constructor(private readonly service: ClinicsService) {}

  @Get()
  @ApiOperation({ summary: "Retrieve clinics for the tenant" })
  getClinics(
    @Tenant() tenantId: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    const resolvedTenantId = tenantId ?? tenantQuery ?? "self-service-tenant";
    if (!resolvedTenantId) {
      throw new BadRequestException("tenant_id is required");
    }
    return this.service.getClinics(resolvedTenantId);
  }

  @Post()
  @ApiOperation({ summary: "Register a clinic for the tenant" })
  @Roles("admin", "manager")
  clinicRegister(
    @Body() dto: RegisterClinicDto,
    @Tenant() tenantId: string,
    @ReqUser("id") userId: string
  ) {
    const resolvedTenantId = tenantId ?? dto.tenantId ?? "self-service-tenant";
    if (!resolvedTenantId) {
      throw new BadRequestException("tenant_id is required");
    }
    const resolvedUserId = userId ?? dto.createdBy ?? "self-service";
    return this.service.clinicRegister(dto, resolvedTenantId, resolvedUserId);
  }
}

