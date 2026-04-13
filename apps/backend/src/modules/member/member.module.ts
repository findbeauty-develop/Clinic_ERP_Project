import { Module } from "@nestjs/common";
import { ClinicsController } from "./controllers/clinics.controller";
import { MembersController } from "./controllers/members.controller";
import { ClinicsService } from "./services/clinics.service";
import { MembersService } from "./services/members.service";
import { ClinicsRepository } from "./repositories/clinics.repository";
import { MembersRepository } from "./repositories/members.repository";
import { SupabaseService } from "../../common/supabase.service";
import { MemberLoginDto } from "./dto/member-login.dto";
import { GoogleVisionService } from "./services/google-vision.service";
import { CertificateParserService } from "./services/certificate-parser.service";
import { MessageService } from "./services/message.service";
import { HiraModule } from "../hira/hira.module";
import { PhoneVerificationService } from "./services/phone-verification.service";
import { EmailService } from "./services/email.service";
import { BrevoProvider } from "./services/providers/brevo.provider";
import { SolapiProvider } from "./services/providers/solapi.provider";

@Module({
  imports: [HiraModule],
  controllers: [ClinicsController, MembersController],
  providers: [
    ClinicsService,
    MembersService,
    ClinicsRepository,
    MembersRepository,
    SupabaseService,
    MemberLoginDto,
    GoogleVisionService,
    CertificateParserService,
    MessageService,
    BrevoProvider,
    PhoneVerificationService,
    EmailService,
    SolapiProvider,
  ],
  exports: [MessageService, EmailService],
})
export class MemberModule {}
