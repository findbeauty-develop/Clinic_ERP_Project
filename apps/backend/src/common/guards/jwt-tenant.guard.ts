import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase.service";

@Injectable()
export class JwtTenantGuard implements CanActivate {
  constructor(private sb: SupabaseService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers.authorization as string | undefined;
    if (!auth?.startsWith("Bearer ")) throw new UnauthorizedException();
    const token = auth.split(" ")[1];
    const { data, error } = await this.sb.getUser(token);
    if (error || !data?.user) throw new UnauthorizedException();
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
}

