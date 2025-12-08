import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    console.log(`🔥🔥🔥 ApiKeyGuard.canActivate called!`);
    
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    
    const validApiKey = process.env.SUPPLIER_BACKEND_API_KEY;
    
    console.log(`🔐 ApiKeyGuard: Received=${apiKey?.substring(0, 20) || 'NONE'}..., Expected=${validApiKey?.substring(0, 20) || 'NONE'}..., Match=${apiKey === validApiKey}`);
    console.log(`🔐 Full comparison: "${apiKey}" === "${validApiKey}"`);
    
    if (!validApiKey) {
      console.log(`❌ validApiKey is missing!`);
      throw new UnauthorizedException('API Key not configured on server');
    }
    
    if (!apiKey || apiKey !== validApiKey) {
      console.log(`❌ API key mismatch or missing!`);
      throw new UnauthorizedException('Invalid or missing API key');
    }
    
    console.log(`✅ API key validated successfully!`);
    return true;
  }
}

