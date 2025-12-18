import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from "@nestjs/swagger";
import { ReturnService } from "./return.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";

@ApiTags("supplier-returns")
@Controller("supplier/returns")
export class ReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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
  @ApiQuery({
    name: "returnType",
    required: false,
    enum: ["반품", "교환"],
    description: "Filter by return type: '반품' (return) or '교환' (exchange)",
  })
  async getReturnNotifications(
    @Req() req: any,
    @Query("status") status?: "PENDING" | "ACCEPTED" | "REJECTED" | "ALL",
    @Query("returnType") returnType?: "반품" | "교환",
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
      returnType: returnType, // Filter by return type: "반품" or "교환"
      isRead: isRead === "true" ? true : isRead === "false" ? false : null,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Put(":id/read")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Accept return (반품 접수)",
    description: "Return'ni qabul qilish",
  })
  async acceptReturn(
    @Param("id") id: string,
    @Body() body: { itemId?: string; adjustments?: Array<{ itemId: string; actualQuantity: number; quantityChangeReason?: string | null }> },
    @Req() req: any
  ) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    
    if (!supplierManagerId) {
      throw new Error("Supplier Manager ID not found in token");
    }

    return this.returnService.acceptReturn(id, supplierManagerId, body.itemId, body.adjustments);
  }

  @Put(":id/reject")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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

  @Put(":id/complete")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Mark return as completed (제품 받았음)",
    description: "Return'ni completed deb belgilash va clinic'ga xabar yuborish",
  })
  async completeReturn(
    @Param("id") id: string,
    @Body() body: { itemId?: string },
    @Req() req: any
  ) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    
    if (!supplierManagerId) {
      throw new Error("Supplier Manager ID not found in token");
    }

    return this.returnService.completeReturn(id, supplierManagerId, body.itemId);
  }

  @Post()
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: "Clinic → Supplier return request yaratish (API Key auth)" })
  @ApiHeader({ name: 'x-api-key', description: 'API Key for clinic-to-supplier authentication' })
  async createReturnRequest(@Body() dto: any) {
    return this.returnService.createReturnRequest(dto);
  }
}

