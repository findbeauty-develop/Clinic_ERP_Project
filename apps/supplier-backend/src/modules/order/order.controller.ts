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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { OrderService } from "./order.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-status.dto";

@ApiTags("supplier-orders")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("supplier/orders")
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: "Clinic → Supplier order yaratish" })
  async create(@Body() dto: CreateOrderDto, @Req() req: any) {
    const supplierManagerId = req.user?.supplierManagerId || dto.supplierManagerId;
    return this.orderService.createOrder({
      ...dto,
      supplierManagerId,
    });
  }

  @Get()
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
  @ApiOperation({ summary: "Order detail (supplier manager)" })
  async getById(@Param("id") id: string, @Req() req: any) {
    const supplierManagerId = req.user?.supplierManagerId;
    return this.orderService.getOrderById(id, supplierManagerId);
  }

  @Put(":id/status")
  @ApiOperation({ summary: "Order status yangilash (confirm / reject / etc)" })
  async updateStatus(
    @Param("id") id: string,
    @Req() req: any,
    @Body() dto: UpdateOrderStatusDto
  ) {
    const supplierManagerId = req.user?.supplierManagerId;
    return this.orderService.updateStatus(id, supplierManagerId, dto);
  }
}

