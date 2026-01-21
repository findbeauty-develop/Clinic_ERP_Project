import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IMessageProvider } from '../message-provider.interface';
import * as crypto from 'crypto';

@Injectable()
export class CoolSMSProvider implements IMessageProvider {
  private readonly logger = new Logger(CoolSMSProvider.name);

  constructor(private configService: ConfigService) {}

  private generateHMAC(date: string, salt: string): string {
    const apiKey = this.configService.get<string>('COOLSMS_API_KEY');
    const apiSecret = this.configService.get<string>('COOLSMS_API_SECRET');
    
    if (!apiKey || !apiSecret) {
      throw new Error('CoolSMS credentials not configured');
    }

    const message = date + salt;
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(message)
      .digest('hex');
    
    return `HMAC-SHA256 ApiKey=${apiKey}, Date=${date}, Salt=${salt}, Signature=${signature}`;
  }

  async sendSMS(phoneNumber: string, message: string): Promise<boolean> {
    try {
      const apiKey = this.configService.get<string>('COOLSMS_API_KEY');
      const apiSecret = this.configService.get<string>('COOLSMS_API_SECRET');
      const fromNumber = this.configService.get<string>('COOLSMS_FROM_NUMBER');

      if (!apiKey || !apiSecret || !fromNumber) {
        this.logger.warn('CoolSMS credentials not configured');
        return false;
      }

      const date = new Date().toISOString();
      const salt = crypto.randomBytes(16).toString('hex');
      const authorization = this.generateHMAC(date, salt);

      const response = await fetch('https://api.coolsms.co.kr/messages/v4/send', {
        method: 'POST',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            to: phoneNumber,
            from: fromNumber,
            text: message,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`CoolSMS API error: ${response.statusText} - ${errorText}`);
      }

     
      return true;
    } catch (error) {
      this.logger.error(`CoolSMS failed: ${error}`);
      return false;
    }
  }

  async sendKakaoTalk(phoneNumber: string, message: string): Promise<boolean> {
    try {
      const apiKey = this.configService.get<string>('COOLSMS_API_KEY');
      const apiSecret = this.configService.get<string>('COOLSMS_API_SECRET');
      const templateCode = this.configService.get<string>('COOLSMS_KAKAO_TEMPLATE_CODE');

      if (!apiKey || !apiSecret) {
        this.logger.warn('CoolSMS credentials not configured');
        return false;
      }

      if (!templateCode) {
        this.logger.warn('CoolSMS KakaoTalk template code not configured');
        return false;
      }

      const date = new Date().toISOString();
      const salt = crypto.randomBytes(16).toString('hex');
      const authorization = this.generateHMAC(date, salt);

      const response = await fetch('https://api.coolsms.co.kr/kakao/v1/send', {
        method: 'POST',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: phoneNumber,
          template_code: templateCode,
          message: message,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`CoolSMS KakaoTalk error: ${response.statusText} - ${errorText}`);
      }

     
      return true;
    } catch (error) {
      this.logger.error(`CoolSMS KakaoTalk failed: ${error}`);
      return false;
    }
  }
}

