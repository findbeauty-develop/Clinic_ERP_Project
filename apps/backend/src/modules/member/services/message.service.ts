import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IMessageProvider } from './message-provider.interface';
import { TwilioProvider } from './providers/twilio.provider';
import { CoolSMSProvider } from './providers/coolsms.provider';
import { KakaoProvider } from './providers/kakao.provider';
import { KTCommunisProvider } from './providers/kt-communis.provider';
import { SolapiProvider } from './providers/solapi.provider';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);
  private provider: IMessageProvider;

  constructor(
    private configService: ConfigService,
    private twilioProvider: TwilioProvider,
    private coolSMSProvider: CoolSMSProvider,
    private kakaoProvider: KakaoProvider,
    private ktCommunisProvider: KTCommunisProvider,
    private solapiProvider: SolapiProvider,
  ) {
    // Config'dan provider tanlash
    const providerName = this.configService.get<string>('MESSAGE_PROVIDER') || 'solapi';
    this.provider = this.getProvider(providerName);
    this.logger.log(`Message provider initialized: ${providerName}`);
  }

  private getProvider(name: string): IMessageProvider {
    switch (name.toLowerCase()) {
      case 'twilio':
        return this.twilioProvider;
      case 'coolsms':
        return this.coolSMSProvider;
      case 'kakao':
        return this.kakaoProvider;
      case 'ktcommunis':
        return this.ktCommunisProvider;
      case 'solapi':
        return this.solapiProvider;
      default:
        this.logger.warn(`Unknown provider: ${name}, using Solapi`);
        return this.solapiProvider;
    }
  }

  /**
   * Member credentials'ni SMS va KakaoTalk orqali yuborish
   */
  async sendMemberCredentials(
    phoneNumber: string,
    clinicName: string,
    members: Array<{ memberId: string; role: string; temporaryPassword: string }>
  ): Promise<{ smsSent: boolean; kakaoSent: boolean }> {
    const message = this.formatMemberCredentialsMessage(clinicName, members);
    
    const [smsSent, kakaoSent] = await Promise.all([
      this.provider.sendSMS(phoneNumber, message).catch(() => false),
      this.provider.sendKakaoTalk(phoneNumber, message).catch(() => false),
    ]);

    return { smsSent, kakaoSent };
  }

  /**
   * Member credentials message format
   */
  private formatMemberCredentialsMessage(
    clinicName: string,
    members: Array<{ memberId: string; role: string; temporaryPassword: string }>
  ): string {
    let message = `[${clinicName}] 계정 정보\n\n`;
    
    members.forEach((member) => {
      const roleLabel = 
        member.role === 'owner' ? '원장' :
        member.role === 'manager' ? '관리자' :
        '직원';
      
      message += `${roleLabel} ID: ${member.memberId}\n`;
      
      // Owner uchun "비밀번호", boshqalar uchun "임시 비밀번호"
      if (member.role === 'owner') {
        message += `비밀번호: ${member.temporaryPassword}\n\n`;
      } else {
        message += `임시 비밀번호: ${member.temporaryPassword}\n\n`;
      }
    });
    
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    if (!frontendUrl) {
      this.logger.warn('FRONTEND_URL is not set in .env, using default localhost URL');
    }
    const baseUrl = frontendUrl || 'http://localhost:3001';
    // Trailing slash'ni olib tashlash
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    message += `로그인: ${cleanBaseUrl}/login\n\n`;
    
    // Owner uchun xabar o'zgartirish
    if (members.some(m => m.role === 'owner') && members.length === 1) {
      message += `※ 비밀번호를 안전하게 보관해주세요.`;
    } else {
      message += `※ 보안을 위해 첫 로그인 시 비밀번호를 변경해주세요.`;
    }
    
    return message;
  }
}

