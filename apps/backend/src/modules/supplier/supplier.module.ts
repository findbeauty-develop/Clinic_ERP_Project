import { Module } from "@nestjs/common";
import { SupplierController } from "./controllers/supplier.controller";
import { SupplierService } from "./services/supplier.service";
import { SupplierRepository } from "./repositories/supplier.repository";
import { ClinicSupplierHelperService } from "./services/clinic-supplier-helper.service";
import { PrismaService } from "../../core/prisma.service";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";

@Module({
  controllers: [SupplierController],
  providers: [
    SupplierService,
    SupplierRepository,
    ClinicSupplierHelperService,
    PrismaService,
    SupabaseService,
    JwtTenantGuard,
  ],
  exports: [SupplierService, ClinicSupplierHelperService],
})
export class SupplierModule {}

