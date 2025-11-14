import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase.service";
import { JwtPayload, verify } from "jsonwebtoken";

@Injectable()
export class JwtTenantGuard implements CanActivate {
  constructor(private sb: SupabaseService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers.authorization as string | undefined;
    if (!auth?.startsWith("Bearer ")) throw new UnauthorizedException();
    const token = auth.split(" ")[1];

    const { data, error } = await this.sb.getUser(token);
    if (!error && data?.user) {
      const tenantId = (data.user.user_metadata as any)?.tenant_id;
      if (!tenantId) throw new ForbiddenException("Tenant not assigned");
      req.user = {
        id: data.user.id,
        email: data.user.email,
        roles: (data.user.user_metadata as any)?.roles ?? [],
      };
      req.tenantId = tenantId;
      return true;
    }

    const secret =
      process.env.MEMBER_JWT_SECRET ??
      process.env.SUPABASE_JWT_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!secret) {
      throw new UnauthorizedException();
    }

    try {
      const payload = verify(token, secret) as JwtPayload & {
        tenant_id?: string;
        tenantId?: string;
        roles?: string[];
        member_id?: string;
      };

      const tenantId = payload.tenant_id ?? payload.tenantId;
      if (!tenantId) {
        throw new ForbiddenException("Tenant not assigned");
      }

      req.user = {
        id: (payload.sub as string) ?? payload.member_id ?? "member",
        email: (payload as any)?.email ?? null,
        roles: payload.roles ?? [],
      };
      req.tenantId = tenantId;
      return true;
    } catch (err) {
      throw new UnauthorizedException();
    }
  }
}

