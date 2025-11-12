import { Module } from "@nestjs/common";
import { ClinicsController } from "./controllers/clinics.controller";
import { MembersController } from "./controllers/members.controller";
import { ClinicsService } from "./services/clinics.service";
import { MembersService } from "./services/members.service";
import { ClinicsRepository } from "./repositories/clinics.repository";
import { MembersRepository } from "./repositories/members.repository";
import { PrismaService } from "../../core/prisma.service";
import { SupabaseService } from "../../common/supabase.service";

@Module({
  controllers: [ClinicsController, MembersController],
  providers: [
    ClinicsService,
    MembersService,
    ClinicsRepository,
    MembersRepository,
    PrismaService,
    SupabaseService,
  ],
})
export class MemberModule {}

