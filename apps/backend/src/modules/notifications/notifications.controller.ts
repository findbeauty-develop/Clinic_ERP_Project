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
    @Req() req: { user: { id: string } },
    @Query("limit") limitStr?: string,
    @Query("page") pageStr?: string
  ) {
    const limit = parseInt(limitStr || "20", 10);
    const page = parseInt(pageStr || "1", 10);
    return this.notificationService.listForMember(tenantId, req.user.id, {
      limit,
      page,
    });
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Unread notification count" })
  async unreadCount(
    @Tenant() tenantId: string,
    @Req() req: { user: { id: string } }
  ) {
    const count = await this.notificationService.unreadCount(
      tenantId,
      req.user.id
    );
    return { count };
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Mark a notification as read" })
  async markRead(
    @Param("id") id: string,
    @Tenant() tenantId: string,
    @Req() req: { user: { id: string } }
  ) {
    return this.notificationService.markRead(id, tenantId, req.user.id);
  }
}
