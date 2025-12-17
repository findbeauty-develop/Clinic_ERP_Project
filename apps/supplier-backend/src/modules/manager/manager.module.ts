import { Module } from "@nestjs/common";
import { ManagerController } from "./manager.controller";
import { ManagerService } from "./manager.service";
import { PrismaService } from "../../core/prisma.service";
import { GoogleVisionService } from "../../services/google-vision.service";
import { BusinessCertificateParserService } from "../../services/business-certificate-parser.service";
import { BusinessVerificationService } from "../../services/business-verification.service";
import { PhoneVerificationService } from "../../services/phone-verification.service";
import { SolapiProvider } from "../../services/providers/solapi.provider";

@Module({
  controllers: [ManagerController],
  providers: [
    ManagerService,
    PrismaService,
    GoogleVisionService,
    BusinessCertificateParserService,
    BusinessVerificationService,
    PhoneVerificationService,
    SolapiProvider,
  ],
  exports: [ManagerService],
})
export class ManagerModule {}

