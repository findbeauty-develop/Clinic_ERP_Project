import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrometheusController } from '@willsoto/nestjs-prometheus';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController extends PrometheusController {}

