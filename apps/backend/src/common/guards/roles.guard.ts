import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const roles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    if (roles.length === 0) return true;
    const req = ctx.switchToHttp().getRequest();
    const userRoles: string[] = req.user?.roles ?? [];
    const ok = roles.some((r) => userRoles.includes(r));
    if (!ok) throw new ForbiddenException("Insufficient role");
    return true;
  }
}

