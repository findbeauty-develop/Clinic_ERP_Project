import { Module } from "@nestjs/common";
import { SupportController } from "./controllers/support.controller";
import { SupportService } from "./services/support.service";
import { SupabaseService } from "../../common/supabase.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
import { MemberModule } from "../member/member.module";

@Module({
  imports: [MemberModule], // Import MemberModule to use MessageService
  controllers: [SupportController],
  providers: [SupportService, SupabaseService, JwtTenantGuard],
  exports: [SupportService],
})
export class SupportModule {}
