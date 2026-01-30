import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const Tenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.tenantId as string;
  }
);
