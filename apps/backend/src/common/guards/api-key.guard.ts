import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers["x-api-key"];
    const validApiKey =
      process.env.SUPPLIER_BACKEND_API_KEY ||
      process.env.API_KEY_SECRET ||
      "";

    if (!validApiKey) {
      this.logger.error("API Key not configured on server");
      throw new UnauthorizedException("API Key not configured on server");
    }

    if (!apiKey || apiKey !== validApiKey) {
      throw new UnauthorizedException("Invalid or missing API key");
    }

    return true;
  }
}
