import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
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
import { ApiKeyHeader, NoCache } from "../decorators/no-cache.decorator";
import { toReturnHistoryFilter } from "../mappers/return-history.mapper";
import { GetReturnHistoryDto } from "../dto/get-return-history.dto";
import { PartialReturnAcceptanceDto } from "../dto/partial-return-acceptance.dto";

@ApiTags("Returns")
@Controller("returns")
@UseGuards(JwtTenantGuard)
@ApiBearerAuth()
export class ReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @Get("available-products")
  @NoCache()
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
  @NoCache()
  @ApiOperation({
    summary: "Return tarixi",
    description: "반납 내역 - Qaytarish tarixini olish",
  })
  async getReturnHistory(
    @Tenant() tenantId: string,
    @Query() query: GetReturnHistoryDto
  ) {
    return this.returnService.getReturnHistory(
      tenantId,
      toReturnHistoryFilter(query)
    );
  }

  @Post(":returnId/manual-complete")
  @ApiOperation({
    summary: "비플랫폼 공급사 반납 — 클리닉 수동 완료",
  })
  async manualCompleteReturn(
    @Tenant() tenantId: string,
    @Param("returnId") returnId: string
  ) {
    return await this.returnService.manualCompleteReturn(returnId, tenantId);
  }

  @Post(":returnId/manual-cancel")
  @ApiOperation({
    summary: "비플랫폼 공급사 반납 — 클리닉 수동 취소 (미반납 수량 복구)",
  })
  async manualCancelReturn(
    @Tenant() tenantId: string,
    @Param("returnId") returnId: string
  ) {
    return await this.returnService.manualCancelReturn(returnId, tenantId);
  }

  @Post("webhook/accept")
  @SetMetadata("skipJwtGuard", true)
  @UseGuards(ApiKeyGuard)
  @ApiKeyHeader()
  @ApiOperation({
    summary: "Webhook: Supplier'dan return accept xabari (for /returns page)",
  })
  async handleReturnAccept(@Body() dto: { return_no: string; status: string }) {
    try {
      return await this.returnService.handleReturnAccept(dto);
    } catch (error: any) {
      console.error("Webhook error:", error);
      throw error;
    }
  }

  @Post("webhooks/return-partial-acceptance")
  @SetMetadata("skipJwtGuard", true)
  @UseGuards(ApiKeyGuard)
  @SetMetadata("requireApiKey", true)
  @ApiKeyHeader()
  @ApiOperation({
    summary: "Webhook: Supplier'dan partial return acceptance (추후반납)",
  })
  async handlePartialReturnAcceptance(
    @Body()
    dto: PartialReturnAcceptanceDto
  ) {
    return this.returnService.handlePartialReturnAcceptance(dto);
  }
}
