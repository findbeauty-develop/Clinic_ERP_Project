import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IMessageProvider } from '../message-provider.interface';
import { SolapiMessageService } from 'solapi';

@Injectable()
export class SolapiProvider implements IMessageProvider {
  private readonly logger = new Logger(SolapiProvider.name);
  private messageService: SolapiMessageService | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('SOLAPI_API_KEY');
    const apiSecret = this.configService.get<string>('SOLAPI_API_SECRET');

    if (apiKey && apiSecret) {
      try {
        this.messageService = new SolapiMessageService(apiKey, apiSecret);
        this.logger.log('Solapi provider initialized');
      } catch (error) {
        this.logger.error(`Failed to initialize Solapi: ${error}`);
      }
    } else {
      this.logger.warn('Solapi credentials not configured');
    }
  }

  async sendSMS(phoneNumber: string, message: string): Promise<boolean> {
    try {
      if (!this.messageService) {
        this.logger.warn('Solapi message service not initialized');
        return false;
      }

      const fromNumber = this.configService.get<string>('SOLAPI_FROM_NUMBER');
      if (!fromNumber) {
        this.logger.warn('Solapi from number not configured');
        return false;
      }

      // Remove any non-numeric characters from phone number (except +)
      const cleanPhoneNumber = phoneNumber.replace(/[^\d+]/g, '');
      
      // Ensure phone number starts with country code (Korea: 82)
      let formattedPhone = cleanPhoneNumber;
      if (formattedPhone.startsWith('0')) {
        // Korean local number (010-xxxx-xxxx) -> convert to international (82-10-xxxx-xxxx)
        formattedPhone = '82' + formattedPhone.substring(1);
      } else if (!formattedPhone.startsWith('82') && !formattedPhone.startsWith('+82')) {
        // If doesn't start with 82, assume it's local and add 82
        formattedPhone = '82' + formattedPhone.replace(/^\+/, '');
      }
      formattedPhone = formattedPhone.replace(/^\+/, ''); // Remove + if present

      const result = await this.messageService.send({
        to: formattedPhone,
        from: fromNumber,
        text: message,
      });

      // Check if result is successful
      if (result && (result as any).successCount > 0) {
        this.logger.log(`Solapi SMS sent to ${phoneNumber} (${formattedPhone})`);
        return true;
      } else if (result && (result as any).groupId) {
        // Alternative: if groupId exists, message was sent
        this.logger.log(`Solapi SMS sent to ${phoneNumber} (${formattedPhone})`);
        return true;
      } else {
        this.logger.warn(`Solapi SMS failed: ${JSON.stringify(result)}`);
        return false;
      }
    } catch (error: any) {
      this.logger.error(`Solapi SMS failed: ${error?.message || error}`);
      return false;
    }
  }

  async sendKakaoTalk(phoneNumber: string, message: string): Promise<boolean> {
    try {
      if (!this.messageService) {
        this.logger.warn('Solapi message service not initialized');
        return false;
      }

      const pfId = this.configService.get<string>('SOLAPI_KAKAO_PF_ID');
      const templateId = this.configService.get<string>('SOLAPI_KAKAO_TEMPLATE_ID');

      if (!pfId || !templateId) {
        this.logger.warn('Solapi KakaoTalk credentials not configured (pfId or templateId missing)');
        return false;
      }

      // Remove any non-numeric characters from phone number (except +)
      const cleanPhoneNumber = phoneNumber.replace(/[^\d+]/g, '');
      
      // Ensure phone number starts with country code (Korea: 82)
      let formattedPhone = cleanPhoneNumber;
      if (formattedPhone.startsWith('0')) {
        // Korean local number (010-xxxx-xxxx) -> convert to international (82-10-xxxx-xxxx)
        formattedPhone = '82' + formattedPhone.substring(1);
      } else if (!formattedPhone.startsWith('82') && !formattedPhone.startsWith('+82')) {
        // If doesn't start with 82, assume it's local and add 82
        formattedPhone = '82' + formattedPhone.replace(/^\+/, '');
      }
      formattedPhone = formattedPhone.replace(/^\+/, ''); // Remove + if present

      // Solapi KakaoAlimTalk API
      // Use send method with kakaoOptions for KakaoAlimTalk
      const result = await this.messageService.send({
        to: formattedPhone,
        from: pfId,
        kakaoOptions: {
          pfId: pfId,
          templateId: templateId,
          // Variables for template replacement (if template uses variables)
          variables: {
            '#{message}': message,
          },
        },
      });

      // Check if result is successful
      if (result && (result as any).successCount > 0) {
        this.logger.log(`Solapi KakaoAlimTalk sent to ${phoneNumber} (${formattedPhone})`);
        return true;
      } else if (result && (result as any).groupId) {
        // Alternative: if groupId exists, message was sent
        this.logger.log(`Solapi KakaoAlimTalk sent to ${phoneNumber} (${formattedPhone})`);
        return true;
      } else {
        this.logger.warn(`Solapi KakaoAlimTalk failed: ${JSON.stringify(result)}`);
        return false;
      }
    } catch (error: any) {
      this.logger.error(`Solapi KakaoAlimTalk failed: ${error?.message || error}`);
      return false;
    }
  }
}

