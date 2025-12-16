import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { HiraService, HiraSearchParams } from '../services/hira.service';
import { JwtTenantGuard } from '../../../common/guards/jwt-tenant.guard';

@ApiTags('hira')
@Controller('hira')
@UseGuards(JwtTenantGuard)
@ApiBearerAuth()
export class HiraController {
  constructor(private readonly hiraService: HiraService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search hospitals using HIRA API' })
  @ApiQuery({ name: 'yadmNm', required: false, description: '의료기관명' })
  @ApiQuery({ name: 'sidoCd', required: false, description: '시도코드' })
  @ApiQuery({ name: 'sgguCd', required: false, description: '시군구코드' })
  @ApiQuery({ name: 'pageNo', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'numOfRows', required: false, type: Number, description: 'Number of rows' })
  async searchHospitals(
    @Query('yadmNm') yadmNm?: string,
    @Query('sidoCd') sidoCd?: string,
    @Query('sgguCd') sgguCd?: string,
    @Query('pageNo') pageNo?: number,
    @Query('numOfRows') numOfRows?: number,
  ) {
    const params: HiraSearchParams = {
      yadmNm,
      sidoCd,
      sgguCd,
      pageNo: pageNo ? Number(pageNo) : undefined,
      numOfRows: numOfRows ? Number(numOfRows) : undefined,
    };
    
    return this.hiraService.searchHospitals(params);
  }
}

