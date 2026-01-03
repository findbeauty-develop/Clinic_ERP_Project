import { Module } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
import { PackageController } from "./controllers/package.controller";
import { PackageRepository } from "./repositories/package.repository";
import { PackageService } from "./services/package.service";
import { ProductModule } from "../product/product.module";

@Module({
  imports: [ProductModule],
  controllers: [PackageController],
  providers: [
    PackageService,
    PackageRepository,
    SupabaseService,
    JwtTenantGuard,
  ],
  exports: [PackageService],
})
export class PackageModule {}
