import { Module } from '@nestjs/common';
import { RejectedOrderService } from './rejected-order.service';
import { RejectedOrderController } from './rejected-order.controller';
import { PrismaService } from '../../core/prisma.service';

@Module({
  controllers: [RejectedOrderController],
  providers: [RejectedOrderService, PrismaService],
  exports: [RejectedOrderService],
})
export class RejectedOrderModule {}

