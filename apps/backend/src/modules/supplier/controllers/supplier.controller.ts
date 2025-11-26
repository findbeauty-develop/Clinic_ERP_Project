import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { SupplierService } from "../services/supplier.service";
import { SearchSupplierDto } from "../dto/search-supplier.dto";
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
    summary: "공급업체 검색 (Search suppliers)",
    description:
      "회사명, 담당자 핸드폰 번호 또는 담당자 이름으로 공급업체를 검색합니다. 회사명, 회사주소, 담당자 정보 등을 반환합니다.",
  })
  @ApiQuery({
    name: "companyName",
    required: false,
    type: String,
    description: "회사명 (Company name)",
  })
  @ApiQuery({
    name: "phoneNumber",
    required: false,
    type: String,
    description: "담당자 핸드폰 번호 (Manager phone number)",
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
    if (!query.companyName && !query.phoneNumber && !query.managerName) {
      throw new BadRequestException(
        "회사명, 담당자 핸드폰 번호 또는 담당자 이름 중 하나는 필수입니다"
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
}

