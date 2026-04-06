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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from "@nestjs/swagger";
import { DefectiveReturnService } from "./defective-return.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";

@ApiTags("supplier-defective-returns")
@Controller("supplier/defective-returns")
export class DefectiveReturnController {
  constructor(private readonly service: DefectiveReturnService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Clinic defective returns for supplier manager" })
  async list(
    @Req() req: any,
    @Query("status") status?: "PENDING" | "ACCEPTED" | "REJECTED" | "ALL",
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    if (!supplierManagerId) {
      throw new Error("Supplier Manager ID not found in token");
    }
    return this.service.getList(supplierManagerId, {
      status: status || "ALL",
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Post()
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: "Clinic → Supplier defective return (API key)" })
  @ApiHeader({ name: "x-api-key" })
  async create(@Body() dto: any) {
    return this.service.createFromClinic(dto);
  }

  @Post("webhook/clinic-exchange-confirmed")
  @UseGuards(ApiKeyGuard)
  @ApiOperation({
    summary:
      "Clinic confirmed defective exchange 수령 → SupplierDefectiveReturn completed (API key)",
  })
  @ApiHeader({ name: "x-api-key" })
  async clinicExchangeConfirmed(@Body() dto: { return_no?: string }) {
    return this.service.completeExchangeFromClinicWebhook(dto?.return_no ?? "");
  }

  @Put(":id/accept")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Accept defective return" })
  async accept(@Param("id") id: string, @Req() req: any) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    if (!supplierManagerId) {
      throw new Error("Supplier Manager ID not found in token");
    }
    return this.service.accept(id, supplierManagerId);
  }

  @Put(":id/reject")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Reject defective return" })
  async reject(
    @Param("id") id: string,
    @Body("reason") reason: string,
    @Req() req: any
  ) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    if (!supplierManagerId) {
      throw new Error("Supplier Manager ID not found in token");
    }
    return this.service.reject(id, supplierManagerId, reason);
  }

  @Put(":id/complete")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Mark defective return completed (product received)" })
  async complete(@Param("id") id: string, @Req() req: any) {
    const supplierManagerId = req.user?.supplierManagerId || req.user?.id;
    if (!supplierManagerId) {
      throw new Error("Supplier Manager ID not found in token");
    }
    return this.service.complete(id, supplierManagerId);
  }
}
