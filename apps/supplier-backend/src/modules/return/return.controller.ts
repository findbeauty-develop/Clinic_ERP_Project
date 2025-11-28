import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { ReturnService } from "./return.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@ApiTags("supplier-returns")
@ApiBearerAuth()
@Controller("supplier/returns")
@UseGuards(JwtAuthGuard)
export class ReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @Get()
  @ApiOperation({
    summary: "Get return notifications for supplier manager",
    description: "Supplier manager'ning return notification'larini olish",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["PENDING", "ACCEPTED", "REJECTED", "ALL"],
    description: "Filter by status",
  })
  @ApiQuery({
    name: "isRead",
    required: false,
    type: Boolean,
    description: "Filter by read status",
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Items per page",
  })
  async getReturnNotifications(
    @Req() req: any,
    @Query("status") status?: "PENDING" | "ACCEPTED" | "REJECTED" | "ALL",
    @Query("isRead") isRead?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    // Get supplier manager ID from JWT token
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    
    if (!supplierManagerId) {
      throw new Error("Supplier Manager ID not found in token");
    }

    return this.returnService.getReturnNotifications(supplierManagerId, {
      status: status || "ALL",
      isRead: isRead === "true" ? true : isRead === "false" ? false : null,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Put(":id/read")
  @ApiOperation({
    summary: "Mark notification as read",
    description: "Notification'ni o'qilgan deb belgilash",
  })
  async markAsRead(@Param("id") id: string, @Req() req: any) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    
    if (!supplierManagerId) {
      throw new Error("Supplier Manager ID not found in token");
    }

    return this.returnService.markAsRead(id, supplierManagerId);
  }

  @Put("read-all")
  @ApiOperation({
    summary: "Mark all notifications as read",
    description: "Barcha notification'larni o'qilgan deb belgilash",
  })
  async markAllAsRead(@Req() req: any) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    
    if (!supplierManagerId) {
      throw new Error("Supplier Manager ID not found in token");
    }

    return this.returnService.markAllAsRead(supplierManagerId);
  }

  @Put(":id/accept")
  @ApiOperation({
    summary: "Accept return (반납 접수)",
    description: "Return'ni qabul qilish",
  })
  async acceptReturn(@Param("id") id: string, @Req() req: any) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    
    if (!supplierManagerId) {
      throw new Error("Supplier Manager ID not found in token");
    }

    return this.returnService.acceptReturn(id, supplierManagerId);
  }

  @Put(":id/reject")
  @ApiOperation({
    summary: "Reject return",
    description: "Return'ni rad etish",
  })
  async rejectReturn(
    @Param("id") id: string,
    @Body("reason") reason: string,
    @Req() req: any
  ) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    
    if (!supplierManagerId) {
      throw new Error("Supplier Manager ID not found in token");
    }

    return this.returnService.rejectReturn(id, supplierManagerId, reason);
  }
}

