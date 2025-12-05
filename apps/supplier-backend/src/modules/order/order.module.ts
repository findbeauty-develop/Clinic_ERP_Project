import { Module } from "@nestjs/common";
import { OrderController } from "./order.controller";
import { OrderService } from "./order.service";
import { PrismaService } from "../../core/prisma.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@Module({
  controllers: [OrderController],
  providers: [OrderService, PrismaService, JwtAuthGuard],
  exports: [OrderService],
})
export class OrderModule {}

