import { Body, Controller, Post, UseGuards } from "@nestjs/common";
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
@UseGuards(JwtTenantGuard, RolesGuard)
export class ClinicsController {
  constructor(private readonly service: ClinicsService) {}

  @Post()
  @ApiOperation({ summary: "Register a clinic for the tenant" })
  @Roles("admin", "manager")
  clinicRegister(
    @Body() dto: RegisterClinicDto,
    @Tenant() tenantId: string,
    @ReqUser("id") userId: string
  ) {
    return this.service.clinicRegister(dto, tenantId, userId);
  }
}

