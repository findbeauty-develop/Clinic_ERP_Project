import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const ReqUser = (key?: string) =>
  createParamDecorator((data: unknown, ctx: ExecutionContext) => {
    const u = ctx.switchToHttp().getRequest().user;
    return key ? u?.[key] : u;
  })();

