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
      // Debug: body'ni log qilish
      this.logger.debug('Received webhook body:', JSON.stringify(body));
      
      // Grafana webhook format'ini handle qilish
      let message = '';
      
      // Variant 1: message field'da (bo'sh bo'lmasa)
      if (body.message && body.message.trim()) {
        message = this.replaceTemplateVariables(body.message, body);
        this.logger.debug('Using message field');
      }
      // Variant 2: Grafana alerting format (alerts array yoki string)
      else if (body.alerts) {
        this.logger.debug('Processing alerts field, type:', typeof body.alerts);
        let alerts: any[] = [];
        
        // Agar alerts string format'ida bo'lsa, parse qilish
        if (typeof body.alerts === 'string') {
          this.logger.debug('Alerts is string, parsing...');
          try {
            alerts = this.parseAlertsString(body.alerts);
            this.logger.debug('Parsed alerts:', JSON.stringify(alerts));
          } catch (e) {
            this.logger.warn('Failed to parse alerts string:', e);
          }
        } else if (Array.isArray(body.alerts)) {
          this.logger.debug('Alerts is array');
          alerts = body.alerts;
        }
        
        if (alerts.length > 0) {
          message = this.formatAlertMessage(alerts[0], body);
          this.logger.debug('Formatted message:', message);
        } else {
          this.logger.warn('No alerts found after parsing');
        }
      }
      // Variant 3: commonAnnotations
      else if (body.commonAnnotations?.description) {
        message = this.replaceTemplateVariables(body.commonAnnotations.description, body);
        this.logger.debug('Using commonAnnotations.description');
      }
      // Variant 4: To'g'ridan-to'g'ri text (string)
      else if (typeof body === 'string') {
        message = this.replaceTemplateVariables(body, body);
        this.logger.debug('Body is string');
      }
      // Variant 5: Body'da to'g'ridan-to'g'ri text field
      else if (body.text) {
        message = this.replaceTemplateVariables(body.text, body);
        this.logger.debug('Using text field');
      }
      // Variant 6: Debug
      else {
        this.logger.warn('Unknown webhook format, body:', JSON.stringify(body));
        message = 'Alert triggered (unknown format)';
      }
      
      if (!message || !message.trim()) {
        this.logger.warn('No message found in webhook body');
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

  private replaceTemplateVariables(text: string, body: any): string {
    // Grafana template variable'larini to'g'ri qiymatlar bilan almashtirish
    let result = text;
    
    // {{ $time }} - joriy vaqt
    if (result.includes('{{ $time }}')) {
      const currentTime = new Date().toISOString();
      result = result.replace(/\{\{\s*\$time\s*\}\}/g, currentTime);
    }
    
    // {{ $value }} - alert qiymati
    if (result.includes('{{ $value }}')) {
      // Grafana'dan kelayotgan format'dan qiymatni olish
      let value = 'N/A';
      
      // Variant 1: body.values dan
      if (body.values && Object.keys(body.values).length > 0) {
        const values = Object.entries(body.values)
          .map(([key, val]) => `${key}=${val}`)
          .join(', ');
        value = values;
      }
      // Variant 2: alerts[0].values dan
      else if (body.alerts && Array.isArray(body.alerts) && body.alerts.length > 0) {
        const alert = body.alerts[0];
        if (alert.values && Object.keys(alert.values).length > 0) {
          const values = Object.entries(alert.values)
            .map(([key, val]) => `${key}=${val}`)
            .join(', ');
          value = values;
        }
      }
      // Variant 3: alerts string format'dan parse qilish
      else if (typeof body.alerts === 'string') {
        const valueMatch = body.alerts.match(/Value:\s*([^\n]+)/);
        if (valueMatch) {
          value = valueMatch[1].trim();
        }
      }
      
      result = result.replace(/\{\{\s*\$value\s*\}\}/g, value);
    }
    
    // {{ $labels.* }} - label'lar
    result = result.replace(/\{\{\s*\$labels\.(\w+)\s*\}\}/g, (match, labelKey) => {
      if (body.labels && body.labels[labelKey]) {
        return body.labels[labelKey];
      }
      return match;
    });
    
    // YOUR_VPS_IP ni to'g'ri IP bilan almashtirish (agar kerak bo'lsa)
    if (result.includes('YOUR_VPS_IP')) {
      // Environment variable'dan olish yoki default qoldirish
      const vpsIp = process.env.VPS_IP || 'YOUR_VPS_IP';
      result = result.replace(/YOUR_VPS_IP/g, vpsIp);
    }
    
    return result;
  }

  private parseAlertsString(alertsString: string): any[] {
    // Grafana alert string format'ini parse qilish
    try {
      this.logger.debug('Parsing alerts string:', alertsString.substring(0, 200));
      const alerts: any[] = [];
      
      // Alert name
      const alertMatch = alertsString.match(/alertname=([^,\s}]+)/);
      // Folder
      const folderMatch = alertsString.match(/grafana_folder=([^,\s}]+)/);
      // Summary
      const summaryMatch = alertsString.match(/summary=([^}]+?)(?:\s+\d{4}-\d{2}-\d{2}|$)/);
      // Description
      const descMatch = alertsString.match(/description=([^}]+?)(?:\s+summary=|$)/);
      // Value
      const valueMatch = alertsString.match(/Value:\s*([^\n]+)/);
      
      this.logger.debug('Matches:', {
        alertname: alertMatch?.[1],
        folder: folderMatch?.[1],
        summary: summaryMatch?.[1]?.substring(0, 50),
        value: valueMatch?.[1],
      });
      
      if (alertMatch || folderMatch || summaryMatch) {
        alerts.push({
          labels: {
            alertname: alertMatch ? alertMatch[1] : 'Unknown',
            grafana_folder: folderMatch ? folderMatch[1] : 'Unknown',
          },
          annotations: {
            summary: summaryMatch ? summaryMatch[1].trim() : 'Alert triggered',
            description: descMatch ? descMatch[1].trim() : (summaryMatch ? summaryMatch[1].trim() : undefined),
          },
          values: valueMatch ? { value: valueMatch[1].trim() } : {},
          status: 'firing',
        });
      }
      
      return alerts;
    } catch (e) {
      this.logger.warn('Failed to parse alerts string:', e);
      return [];
    }
  }

  private formatAlertMessage(alert: any, body: any): string {
    // Alert ma'lumotlarini chiroyli format'ga o'girish
    let message = '';
    
    // Alert name
    const alertName = alert.labels?.alertname || 
                     alert.annotations?.summary || 
                     'Active Cyber Attacks Alert';
    
    // Status emoji
    const status = alert.status || 'firing';
    const emoji = status === 'firing' ? '🚨' : status === 'resolved' ? '✅' : '⚠️';
    
    message += `${emoji} <b>${alertName}</b>\n\n`;
    
    // Description (agar mavjud bo'lsa)
    if (alert.annotations?.description) {
      // Template variable'larni almashtirish
      let description = alert.annotations.description;
      description = this.replaceTemplateVariables(description, { ...body, ...alert });
      message += `${description}\n\n`;
    }
    
    // Summary (agar description'da yo'q bo'lsa)
    if (alert.annotations?.summary && !alert.annotations?.description) {
      message += `<b>Summary:</b> ${alert.annotations.summary}\n\n`;
    }
    
    // Values
    if (alert.values && Object.keys(alert.values).length > 0) {
      const values = Object.entries(alert.values)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      message += `<b>Values:</b> ${values}\n\n`;
    }
    
    // Dashboard links
    if (alert.generatorURL) {
      message += `🔗 <b>View Dashboard:</b> ${alert.generatorURL}\n`;
    }
    
    return message.trim();
  }
}