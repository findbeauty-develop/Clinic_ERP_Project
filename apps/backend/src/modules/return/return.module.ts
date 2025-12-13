import { Module } from "@nestjs/common";
import { ReturnController } from "./controllers/return.controller";
import { ReturnService } from "./services/return.service";
import { ReturnRepository } from "./repositories/return.repository";
import { SupplierReturnNotificationService } from "./services/supplier-return-notification.service";
import { PrismaService } from "../../core/prisma.service";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";

@Module({
  controllers: [ReturnController],
  providers: [
    ReturnService,
    ReturnRepository,
    SupplierReturnNotificationService,
    PrismaService,
    SupabaseService,
    JwtTenantGuard,
  ],
  exports: [ReturnService, SupplierReturnNotificationService, ReturnRepository],
})
export class ReturnModule {}

