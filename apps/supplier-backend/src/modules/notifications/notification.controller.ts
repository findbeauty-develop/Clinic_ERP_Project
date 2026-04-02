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
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { NotificationService } from "./notification.service";

@ApiTags("supplier-notifications")
@ApiBearerAuth()
@Controller("supplier/notifications")
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: "List notifications for the logged-in supplier manager" })
  async list(
    @Req() req: { user: { supplierManagerId: string } },
    @Query("limit") limitStr?: string,
    @Query("page") pageStr?: string
  ) {
    return this.notificationService.list(req.user.supplierManagerId, {
      limit: parseInt(limitStr || "50", 10),
      page: parseInt(pageStr || "1", 10),
    });
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Unread notification count" })
  async unreadCount(@Req() req: { user: { supplierManagerId: string } }) {
    const count = await this.notificationService.unreadCount(req.user.supplierManagerId);
    return { count };
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Mark a notification as read" })
  async markRead(
    @Param("id") id: string,
    @Req() req: { user: { supplierManagerId: string } }
  ) {
    return this.notificationService.markRead(id, req.user.supplierManagerId);
  }
}
