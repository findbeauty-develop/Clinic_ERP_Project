import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  Header,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { PackageService } from "../services/package.service";
import { CreatePackageDto } from "../dto/create-package.dto";
import { UpdatePackageDto } from "../dto/update-package.dto";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { Tenant } from "../../../common/decorators/tenant.decorator";

@ApiTags("packages")
@Controller("packages")
export class PackageController {
  constructor(private readonly packageService: PackageService) {}

  @Get()
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get all packages" })
  @Header("Cache-Control", "public, max-age=30")
  getAllPackages(@Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.packageService.getAllPackages(tenantId);
  }

  @Get("search/names")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "패키지명 자동완성 (Auto-complete)",
    description:
      "패키지 이름 입력 시 Auto-complete 기능 제공. 기존 등록된 이름 자동 제시",
  })
  @ApiQuery({
    name: "q",
    required: true,
    type: String,
    description: "Search query for package name",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Maximum number of results (default: 10)",
  })
  searchPackageNames(
    @Query("q") query: string,
    @Query("limit") limit: string,
    @Tenant() tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    if (!query) {
      throw new BadRequestException("Query parameter 'q' is required");
    }
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.packageService.searchPackageNames(query, tenantId, limitNum);
  }

  @Post("check-duplicate")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "동일 구성 패키지 존재 체크",
    description:
      "동일 구성 패키지 존재 시 추가불가. 패키지 생성/수정 전에 체크",
  })
  checkDuplicatePackage(
    @Body() dto: CreatePackageDto,
    @Query("excludeId") excludeId: string | undefined,
    @Tenant() tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.packageService.checkDuplicatePackage(
      dto.items,
      tenantId,
      excludeId
    );
  }

  @Post("check-name")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "패키지 이름 존재 여부 체크",
    description: "패키지 이름 중복 체크",
  })
  checkPackageName(
    @Body() body: { name: string },
    @Query("excludeId") excludeId: string | undefined,
    @Tenant() tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    if (!body.name) {
      throw new BadRequestException("Package name is required");
    }
    return this.packageService.checkPackageNameExists(
      body.name,
      tenantId,
      excludeId
    );
  }

  @Get(":id")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get package details with items" })
  @Header("Cache-Control", "public, max-age=30")
  getPackage(@Param("id") id: string, @Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.packageService.getPackage(id, tenantId);
  }

  @Get(":id/items")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Get package items for outbound (with batches, stock, expiry info)",
  })
  @Header("Cache-Control", "public, max-age=30")
  getPackageItemsForOutbound(
    @Param("id") id: string,
    @Tenant() tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.packageService.getPackageItemsForOutbound(id, tenantId);
  }

  @Post()
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a new package" })
  createPackage(@Body() dto: CreatePackageDto, @Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.packageService.createPackage(dto, tenantId);
  }

  @Put(":id")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update an existing package" })
  updatePackage(
    @Param("id") id: string,
    @Body() dto: UpdatePackageDto,
    @Tenant() tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.packageService.updatePackage(id, dto, tenantId);
  }

  @Delete(":id")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete a package" })
  deletePackage(@Param("id") id: string, @Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.packageService.deletePackage(id, tenantId);
  }
}
