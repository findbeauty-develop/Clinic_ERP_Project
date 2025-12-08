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
      throw new UnauthorizedException('API Key not configured on server');
    }
    
    if (!apiKey || apiKey !== validApiKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    
    return true;
  }
}

