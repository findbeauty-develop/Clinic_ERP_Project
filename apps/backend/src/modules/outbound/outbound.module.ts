import { Module, forwardRef } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
import { OutboundController } from "./controllers/outbound.controller";
import { OutboundService } from "./services/outbound.service";
import { ProductsService } from "../product/services/products.service";
import { ProductModule } from "../product/product.module";
import { OrderReturnModule } from "../order-return/order-return.module";
import { ReturnModule } from "../return/return.module";

@Module({
  imports: [
    forwardRef(() => ProductModule), // Forward reference to avoid circular dependency
    forwardRef(() => OrderReturnModule),
    ReturnModule,
  ],
  controllers: [OutboundController],
  providers: [OutboundService, SupabaseService, JwtTenantGuard],
  exports: [OutboundService],
})
export class OutboundModule {}
