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
      message += `임시 비밀번호: ${member.temporaryPassword}\n\n`;
    });
    
    const loginUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    message += `로그인: ${loginUrl}/login\n\n`;
    message += `※ 보안을 위해 첫 로그인 시 비밀번호를 변경해주세요.`;
    
    return message;
  }
}

