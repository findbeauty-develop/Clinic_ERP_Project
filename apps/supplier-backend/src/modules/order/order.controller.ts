import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";
import { OrderService } from "./order.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-status.dto";
import { PartialAcceptDto } from "./dto/partial-accept.dto";

@ApiTags("supplier-orders")
@Controller("supplier/orders")
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: "Clinic → Supplier order yaratish (API Key auth)" })
  @ApiHeader({
    name: "x-api-key",
    description: "API Key for clinic-to-supplier authentication",
  })
  async create(@Body() dto: CreateOrderDto) {
    return this.orderService.createOrder(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Supplier manager uchun orderlar ro'yxati" })
  async list(
    @Req() req: any,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const supplierManagerId = req.user?.supplierManagerId;
    return this.orderService.listOrdersForManager(supplierManagerId, {
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Order detail (supplier manager)" })
  async getById(@Param("id") id: string, @Req() req: any) {
    const supplierManagerId = req.user?.supplierManagerId;
    return this.orderService.getOrderById(id, supplierManagerId);
  }

  @Put(":id/status")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Order status yangilash (confirm / reject / etc)" })
  async updateStatus(
    @Param("id") id: string,
    @Req() req: any,
    @Body() dto: UpdateOrderStatusDto
  ) {
    const supplierManagerId = req.user?.supplierManagerId;
    return this.orderService.updateStatus(id, supplierManagerId, dto);
  }

  @Post("complete")
  @UseGuards(ApiKeyGuard)
  @ApiOperation({
    summary: "Receive order completion notification from clinic-backend",
  })
  @ApiHeader({
    name: "x-api-key",
    description: "API Key for clinic-to-supplier authentication",
  })
  async markOrderCompleted(@Body() dto: any) {
    return this.orderService.markOrderCompleted(dto);
  }

  @Post("cancel")
  @UseGuards(ApiKeyGuard)
  @ApiHeader({ name: "x-api-key", description: "API Key for authentication" })
  @ApiOperation({ summary: "Receive order cancellation from clinic-backend" })
  async handleCancellation(@Body() dto: any) {
    return this.orderService.handleCancellation(dto);
  }

  @Put(":id/partial-accept")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Partial order acceptance - split order into accepted and remaining items",
  })
  async partialAccept(
    @Param("id") id: string,
    @Req() req: any,
    @Body() dto: PartialAcceptDto
  ) {
    const supplierManagerId = req.user?.supplierManagerId;
    return this.orderService.partialAcceptOrder(id, supplierManagerId, dto);
  }

  @Put(":id/partial-reject")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Partial order rejection - split order into rejected and remaining items",
  })
  async partialReject(
    @Param("id") id: string,
    @Req() req: any,
    @Body()
    dto: { selectedItemIds: string[]; rejectionReasons: Record<string, string> }
  ) {
    const supplierManagerId = req.user?.supplierManagerId;
    return this.orderService.partialRejectOrder(id, supplierManagerId, dto);
  }
}
