import { Module } from "@nestjs/common";
import { InventoryController } from "./controllers/inventory.controller";
import { InventoryService } from "./services/inventory.service";
import { PrismaService } from "../../core/prisma.service";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryService,
    PrismaService,
    SupabaseService,
    JwtTenantGuard,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}

