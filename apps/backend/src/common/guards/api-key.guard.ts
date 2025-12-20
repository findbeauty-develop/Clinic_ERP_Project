import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const endpoint = request.url;
    
    console.log(`🔐 [ApiKeyGuard] Checking API key for endpoint: ${endpoint}`);
    console.log(`   Received API key: ${apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING'}`);
    
    const validApiKey = process.env.SUPPLIER_BACKEND_API_KEY;
    
    if (!validApiKey) {
      console.error('❌ [ApiKeyGuard] API Key not configured on server: SUPPLIER_BACKEND_API_KEY is missing');
      throw new UnauthorizedException('API Key not configured on server');
    }
    
    console.log(`   Expected API key: ${validApiKey.substring(0, 10)}...`);
    
    if (!apiKey) {
      console.error('❌ [ApiKeyGuard] API Key missing in request headers');
      throw new UnauthorizedException('Invalid or missing API key');
    }
    
    if (apiKey !== validApiKey) {
      console.error(`❌ [ApiKeyGuard] API Key mismatch. Received length: ${apiKey.length}, Expected length: ${validApiKey.length}`);
      console.error(`   First 10 chars received: ${apiKey.substring(0, 10)}`);
      console.error(`   First 10 chars expected: ${validApiKey.substring(0, 10)}`);
      throw new UnauthorizedException('Invalid or missing API key');
    }
    
    console.log('✅ [ApiKeyGuard] API Key validated successfully');
    return true;
  }
}

