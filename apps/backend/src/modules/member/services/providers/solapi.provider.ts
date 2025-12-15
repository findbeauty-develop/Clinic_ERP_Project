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

      // Remove any non-numeric characters (Solapi accepts Korean local format like 01012345678)
      const formattedPhone = phoneNumber.replace(/[^\d]/g, '');

      const result = await this.messageService.send({
        to: formattedPhone,
        from: fromNumber,
        text: message,
      });

      // Check if result is successful
      const groupInfo = (result as any)?.groupInfo;
if (groupInfo) {
  // If groupInfo exists and has groupId, message was accepted
  if (groupInfo.groupId || groupInfo.status === "SENDING" || groupInfo.count?.registeredSuccess > 0) {
    this.logger.log(`Solapi SMS sent to ${phoneNumber} (${formattedPhone})`);
    return true;
  }
}
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
      this.logger.error(`Solapi SMS failed`);
      
      // Error'ning barcha property'larini ko'rsatish
      if (error) {
        this.logger.error(`Error type: ${typeof error}`);
        this.logger.error(`Error constructor: ${error?.constructor?.name || 'unknown'}`);
        
        // Barcha property'larni ko'rsatish
        const errorProps: any = {};
        for (const key in error) {
          if (error.hasOwnProperty(key)) {
            try {
              errorProps[key] = error[key];
            } catch (e) {
              errorProps[key] = '[Cannot serialize]';
            }
          }
        }
        
        if (Object.keys(errorProps).length > 0) {
          this.logger.error(`Error properties: ${JSON.stringify(errorProps, null, 2)}`);
        }
      }
      
      // Message va stack
      if (error?.message) {
        this.logger.error(`Error message: ${error.message}`);
      }
      if (error?.stack) {
        this.logger.debug(`Stack trace: ${error.stack}`);
      }
      
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

      // Remove any non-numeric characters (Solapi accepts Korean local format like 01012345678)
      const formattedPhone = phoneNumber.replace(/[^\d]/g, '');

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
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      const errorDetails = error?.response?.data || error?.body || error;
      
      this.logger.error(`Solapi KakaoAlimTalk failed: ${errorMessage}`);
      
      // Batafsil error ma'lumotlari
      if (error?.response?.data) {
        this.logger.error(`Solapi API error response: ${JSON.stringify(error.response.data, null, 2)}`);
      } else if (errorDetails && typeof errorDetails === 'object') {
        this.logger.error(`Error details: ${JSON.stringify(errorDetails, null, 2)}`);
      }
      
      return false;
    }
  }
}

