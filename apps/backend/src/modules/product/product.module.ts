import { Module, forwardRef } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
import { ProductsController } from "./controllers/products.controller";
import { ProductsRepository } from "./repositories/products.repository";
import { ProductsService } from "./services/products.service";
import { SupplierModule } from "../supplier/supplier.module";
import { OutboundModule } from "../outbound/outbound.module";

@Module({
  imports: [
    SupplierModule, // Import SupplierModule to access ClinicSupplierHelperService
    forwardRef(() => OutboundModule), // Forward reference to avoid circular dependency
  ],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductsRepository,
    SupabaseService,
    JwtTenantGuard,
  ],
  exports: [ProductsService], // ← Qo'shildi (OutboundModule uchun)
})
export class ProductModule {}
