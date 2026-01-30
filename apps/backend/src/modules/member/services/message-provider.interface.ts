export interface IMessageProvider {
  sendSMS(phoneNumber: string, message: string): Promise<boolean>;
  sendKakaoTalk(phoneNumber: string, message: string): Promise<boolean>;
}
