import {
  Body,
  Controller,
  Post,
  UseGuards,
  BadRequestException,
  Get,
  Param,
  Query,
  Delete,
  Header,
} from "@nestjs/common";
import { ApiOperation, ApiTags, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { CreateOutboundDto, BulkOutboundDto } from "../dto/create-outbound.dto";
import { PackageOutboundDto } from "../../package/dto/package-outbound.dto";
import { UnifiedOutboundDto } from "../dto/unified-outbound.dto";
import { OutboundService } from "../services/outbound.service";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { Tenant } from "../../../common/decorators/tenant.decorator";

@ApiTags("outbound")
@Controller("outbound")
export class OutboundController {
  constructor(private readonly outboundService: OutboundService) {}

  @Get("products")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @Header("Cache-Control", "public, max-age=30")
  @ApiOperation({ summary: "Get all products with batches for outbound processing (FEFO sorted)" })
  @ApiQuery({ name: "search", required: false, type: String, description: "Search by product name, brand, or batch number" })
  getProductsForOutbound(
    @Tenant() tenantId: string,
    @Query("search") search?: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.outboundService.getProductsForOutbound(tenantId, search);
  }

  @Post()
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a single outbound transaction" })
  createOutbound(@Body() dto: CreateOutboundDto, @Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.outboundService.createOutbound(dto, tenantId);
  }

  @Post("bulk")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create multiple outbound transactions at once" })
  createBulkOutbound(@Body() dto: BulkOutboundDto, @Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.outboundService.createBulkOutbound(dto, tenantId);
  }

  @Get("history")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @Header("Cache-Control", "public, max-age=30")
  @ApiOperation({
    summary: "출고 내역 조회 - 기간별, 담당자별, 제품/패키지별로 조회 및 관리",
    description:
      "검색어(제품명, 출고자 등), 시간차 순서, 패키지 출고와 단품 출고 구분 표시",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    type: String,
    description: "시작 날짜 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    type: String,
    description: "종료 날짜 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "productId",
    required: false,
    type: String,
    description: "제품 ID",
  })
  @ApiQuery({
    name: "packageId",
    required: false,
    type: String,
    description: "패키지 ID",
  })
  @ApiQuery({
    name: "managerName",
    required: false,
    type: String,
    description: "담당자 이름",
  })
  @ApiQuery({
    name: "outboundType",
    required: false,
    type: String,
    description: "출고 타입 (제품, 패키지, 바코드)",
  })
  @ApiQuery({
    name: "search",
    required: false,
    type: String,
    description: "검색어 (제품명, 출고자, 브랜드, 배치번호 등)",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  getOutboundHistory(
    @Tenant() tenantId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("productId") productId?: string,
    @Query("packageId") packageId?: string,
    @Query("managerName") managerName?: string,
    @Query("outboundType") outboundType?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (productId) filters.productId = productId;
    if (packageId) filters.packageId = packageId;
    if (managerName) filters.managerName = managerName;
    if (outboundType) filters.outboundType = outboundType;
    if (search) filters.search = search;
    if (page) filters.page = parseInt(page, 10);
    if (limit) filters.limit = parseInt(limit, 10);

    return this.outboundService.getOutboundHistory(tenantId, filters);
  }

  @Get(":id")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get a single outbound transaction details" })
  getOutbound(@Param("id") id: string, @Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.outboundService.getOutbound(id, tenantId);
  }

  @Post("package")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Create package outbound - 출고 multiple products as a package",
  })
  createPackageOutbound(
    @Body() dto: PackageOutboundDto,
    @Tenant() tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.outboundService.createPackageOutbound(dto, tenantId);
  }

  @Post("unified")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "통합 출고 처리 - 모든 출고 타입(제품, 패키지, 바코드)을 통합 처리",
    description:
      "출고 예정 목록의 데이터를 최종 검토 후 실제 출고를 확정하는 단계. " +
      "재고 DB 차감 반영, 출고 로그 생성, 오류 발생 시 실패 리스트 출력",
  })
  createUnifiedOutbound(
    @Body() dto: UnifiedOutboundDto,
    @Tenant() tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.outboundService.createUnifiedOutbound(dto, tenantId);
  }

  @Delete("cancel")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "출고 취소 - 특정 시간의 출고 건들을 취소하고 재고 복원",
    description: "출고 내역을 취소하고 제품 재고를 원래대로 복원합니다. outboundTimestamp와 managerName을 query params로 전달합니다.",
  })
  @ApiQuery({ name: "outboundTimestamp", required: true, type: String, description: "출고 시간 (ISO string)" })
  @ApiQuery({ name: "managerName", required: true, type: String, description: "담당자 이름" })
  cancelOutbound(
    @Query("outboundTimestamp") outboundTimestamp: string,
    @Query("managerName") managerName: string,
    @Tenant() tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.outboundService.cancelOutboundByTimestamp(outboundTimestamp, managerName, tenantId);
  }
}

