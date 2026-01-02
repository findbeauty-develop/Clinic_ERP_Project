import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma.service";
import { CreateSupportInquiryDto } from "../dto/create-support-inquiry.dto";
import { MessageService } from "../../member/services/message.service";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messageService: MessageService,
    private readonly configService: ConfigService
  ) {}

  async createInquiry(tenantId: string, dto: CreateSupportInquiryDto) {
    // Create inquiry in database
    const inquiry = await this.prisma.clinicSupportCenter.create({
      data: {
        tenant_id: tenantId,
        member_name: dto.memberName,
        clinic_name: dto.clinicName,
        phone_number: dto.phoneNumber,
        inquiry: dto.inquiry,
      },
    });

    // Send SMS notification to support phone number
    const supportPhone = this.configService.get<string>("SUPPORT_PHONE");
    if (supportPhone) {
      try {
        const smsMessage = `[고객센터 문의]\n\n병의원: ${dto.clinicName}\n이름: ${dto.memberName}\n연락처: ${dto.phoneNumber}\n\n문의 내용:\n${dto.inquiry}`;

        await this.messageService.sendSMS(supportPhone, smsMessage);
        this.logger.log(`Support inquiry SMS sent to ${supportPhone}`);
      } catch (error: any) {
        this.logger.error(
          `Failed to send support inquiry SMS: ${error?.message || error}`
        );
        // Don't throw error - inquiry is already saved, SMS failure is not critical
      }
    } else {
      this.logger.warn("SUPPORT_PHONE not configured in environment variables");
    }

    return {
      success: true,
      message: "문의가 성공적으로 전송되었습니다.",
      inquiryId: inquiry.id,
    };
  }

  async getClinicName(tenantId: string): Promise<string | null> {
    const clinics = await this.prisma.clinic.findMany({
      where: { tenant_id: tenantId },
      take: 1,
    });

    if (clinics.length === 0) {
      return null;
    }

    return clinics[0].name;
  }
}
