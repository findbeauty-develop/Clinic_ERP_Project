import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { MembersService } from "../services/members.service";
import { CreateMembersDto } from "../dto/create-members.dto";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { Tenant } from "../../../common/decorators/tenant.decorator";
import { ReqUser } from "../../../common/decorators/req-user.decorator";
import { MemberLoginDto } from "../dto/member-login.dto";
import { MessageService } from "../services/message.service";
import { SendMembersCredentialsDto } from "../dto/send-members-credentials.dto";

@ApiTags("membership")
@ApiBearerAuth()
@Controller("iam/members")
// @UseGuards(JwtTenantGuard, RolesGuard) TODO: Create guard for member login
export class MembersController {
  constructor(
    private readonly service: MembersService,
    private readonly messageService: MessageService
  ) {}

  @Get()
  @ApiOperation({ summary: "Get all members for a tenant" })
  getMembers(
    @Tenant() tenantId: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    const resolvedTenantId = tenantId ?? tenantQuery ?? "self-service-tenant";
    return this.service.getMembers(resolvedTenantId);
  }

  @Post()
  @ApiOperation({ summary: "Create default members for a clinic (owner, manager, member)" })
  @Roles("admin")
  createMembers(
    @Body() dto: CreateMembersDto,
    @Tenant() tenantId: string,
    @ReqUser("id") userId: string
  ) {
    const resolvedTenantId = tenantId ?? dto.tenantId ?? "self-service-tenant";
    const resolvedUserId = userId ?? dto.createdBy ?? "self-service";
    return this.service.createMembers(dto, resolvedTenantId, resolvedUserId);
  }

  @Post("login")
  @ApiOperation({ summary: "Login member by member_id and password" })
  async login(@Body() dto: MemberLoginDto) {
    return this.service.login(dto.memberId, dto.password);
  }

  @Post("send-credentials")
  @ApiOperation({ summary: "Send temporary passwords via SMS and KakaoTalk" })
  async sendCredentials(
    @Body() dto: SendMembersCredentialsDto,
    @Tenant() tenantId?: string
  ) {
    const resolvedTenantId = tenantId ?? "self-service-tenant";
    return this.messageService.sendMemberCredentials(
      dto.ownerPhoneNumber,
      dto.clinicName,
      dto.members
    );
  }

  @Post("change-password")
  @UseGuards(JwtTenantGuard)
  @ApiOperation({ summary: "Change password (for temporary password change)" })
  async changePassword(
    @Body() body: { memberId?: string; currentPassword: string; newPassword: string },
    @ReqUser("member_id") tokenMemberId?: string,
    @Tenant() tenantId?: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    // memberId'ni token'dan yoki body'dan olish
    const memberId = tokenMemberId || body.memberId;
    if (!memberId) {
      throw new Error("Member ID is required");
    }
    // tenantId'ni guard'dan, query'dan yoki header'dan olish
    const resolvedTenantId = tenantId ?? tenantQuery ?? "self-service-tenant";
    return this.service.changePassword(
      memberId,
      body.currentPassword,
      body.newPassword,
      resolvedTenantId
    );
  }
}

