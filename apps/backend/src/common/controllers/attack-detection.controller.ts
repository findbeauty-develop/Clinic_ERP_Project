import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AttackDetectionService } from '../services/attack-detection.service';
import { JwtTenantGuard } from '../guards/jwt-tenant.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';

@ApiTags('security')
@ApiBearerAuth()
@Controller('security/attacks')
@UseGuards(JwtTenantGuard, RolesGuard)
@Roles('owner', 'admin') // ✅ Faqat owner va admin ko'ra oladi
export class AttackDetectionController {
  constructor(private readonly attackDetectionService: AttackDetectionService) {}

  @Get('ip-stats')
  @ApiOperation({ summary: 'Get attack statistics for a specific IP address' })
  async getIPStatistics(@Query('ip') ip: string) {
    if (!ip) {
      return {
        success: false,
        message: 'IP address is required',
      };
    }

    const stats = this.attackDetectionService.getIPStatistics(ip);
    return {
      success: true,
      ip,
      statistics: stats,
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Check attack detection service health' })
  async getHealth() {
    return {
      success: true,
      service: 'attack-detection',
      status: 'operational',
      timestamp: new Date().toISOString(),
    };
  }
}

