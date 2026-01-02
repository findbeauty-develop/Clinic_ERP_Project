import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { SupportService } from "../services/support.service";
import { CreateSupportInquiryDto } from "../dto/create-support-inquiry.dto";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { Tenant } from "../../../common/decorators/tenant.decorator";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("support")
@ApiBearerAuth()
@Controller("support")
@UseGuards(JwtTenantGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post("inquiry")
  @ApiOperation({ summary: "Submit a support inquiry" })
  async createInquiry(
    @Tenant() tenantId: string,
    @Body() dto: CreateSupportInquiryDto
  ) {
    return this.supportService.createInquiry(tenantId, dto);
  }

  @Get("clinic-name")
  @ApiOperation({ summary: "Get clinic name for auto-fill" })
  async getClinicName(@Tenant() tenantId: string) {
    const clinicName = await this.supportService.getClinicName(tenantId);
    return { clinicName };
  }
}
