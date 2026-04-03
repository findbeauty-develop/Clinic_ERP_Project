import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { NotificationService } from "./notification.service";

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
@UseGuards(JwtTenantGuard)
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: "List notifications for the current member" })
  async list(
    @Tenant() tenantId: string,
    @Req() req: { user: { id: string; member_id?: string | null } },
    @Query("limit") limitStr?: string,
    @Query("page") pageStr?: string
  ) {
    const limit = parseInt(limitStr || "20", 10);
    const page = parseInt(pageStr || "1", 10);
    const memberPk = await this.notificationService.resolveRecipientMemberIdForList(
      tenantId,
      req.user
    );
    return this.notificationService.listForMember(tenantId, memberPk, {
      limit,
      page,
    });
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Unread notification count" })
  async unreadCount(
    @Tenant() tenantId: string,
    @Req() req: { user: { id: string; member_id?: string | null } }
  ) {
    const memberPk = await this.notificationService.resolveRecipientMemberIdForList(
      tenantId,
      req.user
    );
    const count = await this.notificationService.unreadCount(
      tenantId,
      memberPk
    );
    return { count };
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Mark a notification as read" })
  async markRead(
    @Param("id") id: string,
    @Tenant() tenantId: string,
    @Req() req: { user: { id: string; member_id?: string | null } }
  ) {
    const memberPk = await this.notificationService.resolveRecipientMemberIdForList(
      tenantId,
      req.user
    );
    return this.notificationService.markRead(id, tenantId, memberPk);
  }
}
