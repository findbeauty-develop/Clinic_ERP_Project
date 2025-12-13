import { Module, forwardRef } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
import { OutboundController } from "./controllers/outbound.controller";
import { OutboundService } from "./services/outbound.service";
import { ProductsService } from "../product/services/products.service";
import { ProductModule } from "../product/product.module";
import { OrderReturnModule } from "../order-return/order-return.module";
import { ReturnModule } from "../return/return.module";

@Module({
  imports: [ProductModule, forwardRef(() => OrderReturnModule), ReturnModule],
  controllers: [OutboundController],
  providers: [
    OutboundService,
    PrismaService,
    SupabaseService,
    JwtTenantGuard,
  ],
  exports: [OutboundService],
})
export class OutboundModule {}

