import { Module } from "@nestjs/common";
import { ClinicsController } from "./controllers/clinics.controller";
import { MembersController } from "./controllers/members.controller";
import { ClinicsService } from "./services/clinics.service";
import { MembersService } from "./services/members.service";
import { ClinicsRepository } from "./repositories/clinics.repository";
import { MembersRepository } from "./repositories/members.repository";
import { PrismaService } from "../../core/prisma.service";
import { SupabaseService } from "../../common/supabase.service";
import { MemberLoginDto } from "./dto/member-login.dto";
import { GoogleVisionService } from "./services/google-vision.service";
import { CertificateParserService } from "./services/certificate-parser.service";
import { MessageService } from "./services/message.service";
import { TwilioProvider } from "./services/providers/twilio.provider";
import { CoolSMSProvider } from "./services/providers/coolsms.provider";
import { KakaoProvider } from "./services/providers/kakao.provider";
import { KTCommunisProvider } from "./services/providers/kt-communis.provider";

@Module({
  controllers: [ClinicsController, MembersController],
  providers: [
    ClinicsService,
    MembersService,
    ClinicsRepository,
    MembersRepository,
    PrismaService,
    SupabaseService,
    MemberLoginDto,
    GoogleVisionService,
    CertificateParserService,
    MessageService,
    TwilioProvider,
    CoolSMSProvider,
    KakaoProvider,
    KTCommunisProvider,
  ],
})
export class MemberModule {}

