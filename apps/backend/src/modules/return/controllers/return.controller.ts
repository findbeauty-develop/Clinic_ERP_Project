import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  Header,
  SetMetadata,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
  ApiHeader,
} from "@nestjs/swagger";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { ApiKeyGuard } from "../../../common/guards/api-key.guard";
import { Tenant } from "../../../common/decorators/tenant.decorator";
import { ReturnService } from "../services/return.service";
import { CreateReturnDto } from "../dto/create-return.dto";

@ApiTags("Returns")
@Controller("returns")
@UseGuards(JwtTenantGuard)
@ApiBearerAuth()
export class ReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @Get("available-products")
  @Header("Cache-Control", "public, max-age=30")
  @ApiOperation({
    summary: "Qaytarilishi mumkin bo'lgan mahsulotlar ro'yxati",
    description:
      "미반납 수량 (unreturned quantity) bilan qaytarilishi mumkin bo'lgan mahsulotlarni qaytaradi",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Search query (제품명, 브랜드, 배치번호)",
  })
  async getAvailableProducts(
    @Tenant() tenantId: string,
    @Query("search") search?: string
  ) {
    return await this.returnService.getAvailableProducts(tenantId, search);
  }

  @Post("process")
  @ApiOperation({
    summary: "Qaytarish amalga oshirish",
    description: "반납 처리 - Mahsulotlarni qaytarish va stock'ni yangilash",
  })
  async processReturn(
    @Tenant() tenantId: string,
    @Body() dto: CreateReturnDto
  ) {
    return await this.returnService.processReturn(dto, tenantId);
  }

  @Get("history")
  @ApiOperation({
    summary: "Return tarixi",
    description: "반납 내역 - Qaytarish tarixini olish",
  })
  @ApiQuery({
    name: "productId",
    required: false,
    description: "Product ID bo'yicha filter",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Boshlanish sanasi (ISO format)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "Tugash sanasi (ISO format)",
  })
  @ApiQuery({
    name: "page",
    required: false,
    description: "Sahifa raqami",
    type: Number,
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Har bir sahifadagi elementlar soni",
    type: Number,
  })
  async getReturnHistory(
    @Tenant() tenantId: string,
    @Query("productId") productId?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number
  ) {
    const filters: any = {};

    if (productId) {
      filters.productId = productId;
    }

    if (startDate) {
      filters.startDate = new Date(startDate);
    }

    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    if (page) {
      filters.page = page;
    }

    if (limit) {
      filters.limit = limit;
    }

    return await this.returnService.getReturnHistory(tenantId, filters);
  }

  @Post("webhook/accept")
  @SetMetadata("skipJwtGuard", true)
  @UseGuards(ApiKeyGuard)
  @ApiOperation({
    summary: "Webhook: Supplier'dan return accept xabari (for /returns page)",
  })
  @ApiHeader({
    name: "x-api-key",
    description: "API Key for supplier-to-clinic authentication",
  })
  async handleReturnAccept(@Body() dto: { return_no: string; status: string }) {
    try {
      return await this.returnService.handleReturnAccept(dto);
    } catch (error: any) {
      console.error("Webhook error:", error);
      throw error;
    }
  }
}
