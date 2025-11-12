import { Module } from "@nestjs/common";
import { ClinicsController } from "./controllers/clinics.controller";
import { ClinicsService } from "./services/clinics.service";
import { ClinicsRepository } from "./repositories/clinics.repository";
import { PrismaService } from "../../core/prisma.service";
import { SupabaseService } from "../../common/supabase.service";

@Module({
  controllers: [ClinicsController],
  providers: [ClinicsService, ClinicsRepository, PrismaService, SupabaseService],
})
export class MemberModule {}

