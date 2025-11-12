import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { MembersService } from "../services/members.service";
import { CreateMembersDto } from "../dto/create-members.dto";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { Tenant } from "../../../common/decorators/tenant.decorator";
import { ReqUser } from "../../../common/decorators/req-user.decorator";
import { MemberLoginDto } from "../dto/member-login.dto";

@ApiTags("membership")
@ApiBearerAuth()
@Controller("iam/members")
// @UseGuards(JwtTenantGuard, RolesGuard) TODO: Create guard for member login
export class MembersController {
  constructor(private readonly service: MembersService) {}

  @Post()
  @ApiOperation({ summary: "Create default members for a clinic (owner, manager, member)" })
  @Roles("admin")
  createMembers(@Body() dto: CreateMembersDto, @Tenant() tenantId: string, @ReqUser("id") userId: string) {
    return this.service.createMembers(dto, tenantId, userId);
  }

  @Post("login")
@ApiOperation({ summary: "Login member by member_id and password" })
async login(@Body() dto: MemberLoginDto) {
  return this.service.login(dto.memberId, dto.password);
}
}

