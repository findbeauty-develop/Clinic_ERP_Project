import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SupabaseService } from "../supabase.service";
import { JwtPayload, verify } from "jsonwebtoken";

@Injectable()
export class JwtTenantGuard implements CanActivate {
  constructor(
    private sb: SupabaseService,
    private reflector: Reflector
  ) {}

  async canActivate(ctx: ExecutionContext) {
    // Check if the endpoint should skip JWT authentication
    const skipJwtGuard = this.reflector.get<boolean>(
      "skipJwtGuard",
      ctx.getHandler()
    );
    if (skipJwtGuard) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers.authorization as string | undefined;
    if (!auth?.startsWith("Bearer ")) throw new UnauthorizedException();
    const token = auth.split(" ")[1];

    // Try Supabase first, but fallback to local JWT if it fails (network issues, etc.)
    try {
      const { data, error } = await this.sb.getUser(token);
      if (!error && data?.user) {
        let tenantId = (data.user.user_metadata as any)?.tenant_id;

        // Fallback to X-Tenant-Id header if not in user metadata
        if (!tenantId) {
          tenantId = req.headers["x-tenant-id"] as string | undefined;
        }

        if (!tenantId) throw new ForbiddenException("Tenant not assigned");
        req.user = {
          id: data.user.id,
          email: data.user.email,
          roles: (data.user.user_metadata as any)?.roles ?? [],
        };
        req.tenantId = tenantId;
        return true;
      }
    } catch (supabaseError: any) {
      // If Supabase fails (network timeout, etc.), fall through to local JWT verification
      console.warn(
        "Supabase verification failed, falling back to local JWT:",
        supabaseError?.message || String(supabaseError)
      );
    }

    // Fallback to local JWT verification
    const secret =
      process.env.MEMBER_JWT_SECRET ??
      process.env.SUPABASE_JWT_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!secret) {
      throw new UnauthorizedException("JWT secret not configured");
    }

    try {
      const payload = verify(token, secret) as JwtPayload & {
        tenant_id?: string;
        tenantId?: string;
        roles?: string[];
        member_id?: string;
      };

      let tenantId = payload.tenant_id ?? payload.tenantId;

      // Fallback to X-Tenant-Id header if not in token
      if (!tenantId) {
        tenantId = req.headers["x-tenant-id"] as string | undefined;
      }

      if (!tenantId) {
        throw new ForbiddenException("Tenant not assigned");
      }

      req.user = {
        id: (payload.sub as string) ?? payload.member_id ?? "member",
        member_id: payload.member_id, // Add member_id to user object
        email: (payload as any)?.email ?? null,
        roles: payload.roles ?? [],
        tenant_id: tenantId,
        clinic_name: (payload as any)?.clinic_name,
        must_change_password: (payload as any)?.must_change_password,
      };
      req.tenantId = tenantId;
      return true;
    } catch (err) {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
