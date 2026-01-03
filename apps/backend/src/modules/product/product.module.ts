import { Module } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
import { ProductsController } from "./controllers/products.controller";
import { ProductsRepository } from "./repositories/products.repository";
import { ProductsService } from "./services/products.service";
import { SupplierModule } from "../supplier/supplier.module";

@Module({
  imports: [SupplierModule], // Import SupplierModule to access ClinicSupplierHelperService
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
