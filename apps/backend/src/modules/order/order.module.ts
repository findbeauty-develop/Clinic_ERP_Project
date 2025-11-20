import { Module } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
import { OrderController } from "./controllers/order.controller";
import { OrderService } from "./services/order.service";
import { OrderRepository } from "./repositories/order.repository";
import { ProductModule } from "../product/product.module";

@Module({
  imports: [ProductModule],
  controllers: [OrderController],
  providers: [
    OrderService,
    OrderRepository,
    PrismaService,
    SupabaseService,
    JwtTenantGuard,
  ],
  exports: [OrderService],
})
export class OrderModule {}

