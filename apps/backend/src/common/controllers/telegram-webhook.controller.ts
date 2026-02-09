import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TelegramNotificationService } from '../services/telegram-notification.service';

@ApiTags('telegram')
@Controller('telegram/webhook')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly telegramService: TelegramNotificationService
  ) {}

  @Post('alert')
  async receiveAlert(@Body() body: any) {
    try {
      const { message } = body;
      
      if (!message) {
        this.logger.warn('No message in webhook body');
        return { success: false, error: 'No message provided' };
      }

      // Telegram'ga yuborish
      const sent = await this.telegramService.sendMessage(message);
      
      if (sent) {
        this.logger.log('Alert notification sent to Telegram');
        return { success: true };
      } else {
        this.logger.error('Failed to send alert notification');
        return { success: false, error: 'Failed to send notification' };
      }
    } catch (error: any) {
      this.logger.error(`Webhook error: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }
}