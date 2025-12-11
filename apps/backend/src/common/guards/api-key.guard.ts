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
    
    const validApiKey = process.env.SUPPLIER_BACKEND_API_KEY;
    
    if (!validApiKey) {
      console.error('API Key not configured on server: SUPPLIER_BACKEND_API_KEY is missing');
      throw new UnauthorizedException('API Key not configured on server');
    }
    
    if (!apiKey) {
      console.error('API Key missing in request headers');
      throw new UnauthorizedException('Invalid or missing API key');
    }
    
    if (apiKey !== validApiKey) {
      console.error(`API Key mismatch. Received length: ${apiKey.length}, Expected length: ${validApiKey.length}`);
      throw new UnauthorizedException('Invalid or missing API key');
    }
    
    return true;
  }
}

