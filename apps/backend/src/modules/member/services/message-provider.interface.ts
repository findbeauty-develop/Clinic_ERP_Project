export interface IMessageProvider {
  sendSMS(phoneNumber: string, message: string, isCritical?: boolean): Promise<boolean>;
  sendKakaoTalk(phoneNumber: string, message: string): Promise<boolean>;
}
