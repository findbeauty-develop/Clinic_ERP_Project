import { Module } from "@nestjs/common";
import { HiraService } from "./services/hira.service";
import { HiraController } from "./controllers/hira.controller";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";

@Module({
  controllers: [HiraController],
  providers: [HiraService, SupabaseService, JwtTenantGuard],
  exports: [HiraService], // Export so other modules can use it
})
export class HiraModule {}
