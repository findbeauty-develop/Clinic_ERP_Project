import { Module } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
import { OrderController } from "./controllers/order.controller";
import { OrderWebhookController } from "./controllers/order-webhook.controller";
import { OrderService } from "./services/order.service";
import { OrderRepository } from "./repositories/order.repository";
import { ProductModule } from "../product/product.module";
import { MemberModule } from "../member/member.module";

@Module({
  imports: [ProductModule, MemberModule], // Import MemberModule to use MessageService
  controllers: [OrderController, OrderWebhookController],
  providers: [OrderService, OrderRepository, SupabaseService, JwtTenantGuard],
  exports: [OrderService],
})
export class OrderModule {}
