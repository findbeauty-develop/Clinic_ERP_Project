import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma.service';
import { MessageService } from './message.service';

@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);
  private readonly CODE_EXPIRY_MINUTES = 5;
  private readonly RATE_LIMIT_MINUTES = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messageService: MessageService,
  ) {}

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendVerificationCode(phoneNumber: string): Promise<{ success: boolean; message: string }> {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      throw new BadRequestException('올바른 전화번호 형식을 입력하세요');
    }

    // Rate limiting: Check if code was sent in the last 1 minute
    const oneMinuteAgo = new Date(Date.now() - this.RATE_LIMIT_MINUTES * 60 * 1000);
    const recentCode = await this.prisma.phoneVerificationCode.findFirst({
      where: {
        phone_number: cleanPhone,
        created_at: {
          gte: oneMinuteAgo,
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    if (recentCode && !recentCode.verified) {
      throw new BadRequestException(
        `인증번호는 ${this.RATE_LIMIT_MINUTES}분에 한 번만 요청할 수 있습니다. 잠시 후 다시 시도해주세요.`
      );
    }

    // Generate code
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.CODE_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate previous unverified codes for this phone number
    await this.prisma.phoneVerificationCode.updateMany({
      where: {
        phone_number: cleanPhone,
        verified: false,
      },
      data: {
        verified: true, // Mark as "used" (invalidated)
      },
    });

    // Save code to database
    await this.prisma.phoneVerificationCode.create({
      data: {
        phone_number: cleanPhone,
        code,
        expires_at: expiresAt,
      },
    });

    // Send SMS
    const message = `[${code}] 클리닉 등록 인증번호입니다.`;
    const smsSent = await this.messageService.sendSMS(cleanPhone, message);
    
    if (!smsSent) {
      this.logger.error(`Failed to send SMS to ${cleanPhone}`);
      throw new BadRequestException('인증번호 전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }

    this.logger.log(`Verification code sent to ${cleanPhone}`);
    return {
      success: true,
      message: '인증번호가 전송되었습니다.',
    };
  }

  async verifyCode(phoneNumber: string, code: string): Promise<{ verified: boolean; success: boolean }> {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    
    if (!code || code.length !== 6) {
      throw new BadRequestException('인증번호는 6자리 숫자입니다.');
    }

    // Find the most recent unverified code for this phone number
    const verificationCode = await this.prisma.phoneVerificationCode.findFirst({
      where: {
        phone_number: cleanPhone,
        verified: false,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    if (!verificationCode) {
      return { verified: false, success: false };
    }

    // Check if code is expired
    if (new Date() > verificationCode.expires_at) {
      return { verified: false, success: false };
    }

    // Check if code matches
    if (verificationCode.code !== code) {
      return { verified: false, success: false };
    }

    // Mark as verified
    await this.prisma.phoneVerificationCode.update({
      where: { id: verificationCode.id },
      data: { verified: true },
    });

    this.logger.log(`Phone ${cleanPhone} verified successfully`);
    return { verified: true, success: true };
  }
}