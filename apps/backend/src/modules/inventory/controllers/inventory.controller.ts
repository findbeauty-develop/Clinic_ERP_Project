import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { Tenant } from "../../../common/decorators/tenant.decorator";
import { InventoryService } from "../services/inventory.service";

@ApiTags("Inventory")
@Controller("inventory")
@UseGuards(JwtTenantGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get("summary")
  @ApiOperation({
    summary: "Get inventory summary (inbound/outbound totals)",
    description: "재고 현황 요약 - 입출고 총량 및 비교",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Start date (ISO format)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "End date (ISO format)",
  })
  async getInventorySummary(
    @Tenant() tenantId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.inventoryService.getInventorySummary(
      tenantId,
      start,
      end
    );
  }

  @Get("risky")
  @ApiOperation({
    summary: "Get risky inventory (products with imminent expiry)",
    description: "위험재고 - 유효기간 임박 제품",
  })
  async getRiskyInventory(@Tenant() tenantId: string) {
    return await this.inventoryService.getRiskyInventory(tenantId);
  }

  @Get("depletion")
  @ApiOperation({
    summary: "Get depletion list (products nearing stockout)",
    description: "소진 - 재고 부족 제품",
  })
  async getDepletionList(@Tenant() tenantId: string) {
    return await this.inventoryService.getDepletionList(tenantId);
  }

  @Get("top-value")
  @ApiOperation({
    summary: "Get top value products (by inventory value)",
    description: "재고 가치 상위 제품",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Number of products to return (default: 8)",
  })
  async getTopValueProducts(
    @Tenant() tenantId: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number
  ) {
    return await this.inventoryService.getTopValueProducts(
      tenantId,
      limit || 8
    );
  }

  @Get("by-location")
  @ApiOperation({
    summary: "Get inventory by location",
    description: "위치별 보기 - 위치별 재고 현황",
  })
  @ApiQuery({
    name: "location",
    required: false,
    description: "Filter by specific location",
  })
  async getInventoryByLocation(
    @Tenant() tenantId: string,
    @Query("location") location?: string
  ) {
    return await this.inventoryService.getInventoryByLocation(
      tenantId,
      location
    );
  }
}
