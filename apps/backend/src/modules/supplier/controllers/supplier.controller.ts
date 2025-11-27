import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { SupplierService } from "../services/supplier.service";
import { SearchSupplierDto } from "../dto/search-supplier.dto";
import { CreateSupplierManualDto } from "../dto/create-supplier-manual.dto";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { Tenant } from "../../../common/decorators/tenant.decorator";

@ApiTags("supplier")
@ApiBearerAuth()
@Controller("supplier")
// @UseGuards(JwtTenantGuard)
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Get("search")
  @ApiOperation({
    summary: "공급업체 검색 (Primary search - companyName + managerName)",
    description:
      "회사명과 담당자 이름으로 공급업체를 검색합니다. 거래 관계가 승인된(APPROVED ClinicSupplierLink) 공급업체만 반환됩니다. 전화번호로 검색하려면 /supplier/search-by-phone 엔드포인트를 사용하세요.",
  })
  @ApiQuery({
    name: "companyName",
    required: false,
    type: String,
    description: "회사명 (Company name)",
  })
  @ApiQuery({
    name: "managerName",
    required: false,
    type: String,
    description: "담당자 이름 (Manager name)",
  })
  async searchSuppliers(
    @Query() query: SearchSupplierDto,
    @Tenant() tenantId: string
  ) {
    // Primary search: ONLY companyName and/or managerName
    // phoneNumber is NOT allowed - use /supplier/search-by-phone for phone search
    if (query.phoneNumber) {
      throw new BadRequestException(
        "전화번호로 검색하려면 /supplier/search-by-phone 엔드포인트를 사용하세요."
      );
    }

    if (!query.companyName && !query.managerName) {
      throw new BadRequestException(
        "회사명 또는 담당자 이름 중 하나는 필수입니다"
      );
    }

    return this.supplierService.searchSuppliers(query, tenantId);
  }

  @Get("search-by-phone")
  @ApiOperation({
    summary: "공급업체 핸드폰 번호로 검색 (Fallback search by phone)",
    description:
      "거래 이력이 없는 공급업체도 찾을 수 있는 폴백 검색입니다. 핸드폰 번호로만 검색합니다.",
  })
  @ApiQuery({
    name: "phoneNumber",
    required: true,
    type: String,
    description: "담당자 핸드폰 번호 (Manager phone number)",
  })
  async searchSuppliersByPhone(
    @Query("phoneNumber") phoneNumber: string,
    @Tenant() tenantId: string
  ) {
    if (!phoneNumber) {
      throw new BadRequestException("핸드폰 번호는 필수입니다");
    }

    return this.supplierService.searchSuppliersByPhone(phoneNumber);
  }

  @Post("create-manual")
  @UseGuards(JwtTenantGuard)
  @ApiOperation({
    summary: "Clinic tomonidan manual supplier yaratish/update qilish",
    description:
      "Clinic tomonidan supplier ma'lumotlarini manual kiritish. business_number va phone_number bo'yicha upsert qiladi.",
  })
  async createSupplierManual(
    @Body() dto: CreateSupplierManualDto,
    @Tenant() tenantId: string
  ) {
    console.log("Received create-manual request:", { dto, tenantId });
    
    if (!dto.companyName || !dto.businessNumber) {
      throw new BadRequestException("회사명과 사업자 등록번호는 필수입니다");
    }

    const result = await this.supplierService.createOrUpdateSupplierManual(dto, tenantId);
    console.log("Supplier created/updated successfully:", result);
    
    return result;
  }

  @Post("approve-trade-link")
  @UseGuards(JwtTenantGuard)
  @ApiOperation({
    summary: "공급업체와의 거래 관계 승인 (Approve trade relationship)",
    description:
      "Clinic tomonidan supplier bilan trade relationship'ni APPROVED qilish. Phone search natijasidan keyin chaqiriladi.",
  })
  async approveTradeLink(
    @Body("supplierId") supplierId: string,
    @Tenant() tenantId: string
  ) {
    if (!supplierId) {
      throw new BadRequestException("공급업체 ID는 필수입니다");
    }

    return this.supplierService.approveTradeLink(tenantId, supplierId);
  }
}

