import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { verify } from "jsonwebtoken";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Authorization token is required");
    }

    const token = authHeader.substring(7);

    try {
      const secret =
        process.env.SUPPLIER_JWT_SECRET ||
        process.env.SUPABASE_JWT_SECRET ||
        "supplier-secret";
      const payload = verify(token, secret) as any;
      
      // Attach user info to request
      request.user = {
        id: payload.sub,
        supplierManagerId: payload.sub, // SupplierManager database ID
        managerId: payload.managerId,
        email: payload.email,
        supplierId: payload.supplierId,
        type: payload.type,
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}

