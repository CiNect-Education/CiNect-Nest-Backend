import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  id: string;
  email: string;
  roles?: string[];
  [key: string]: unknown;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext): CurrentUserPayload | unknown => {
    const request = ctx.switchToHttp().getRequest<{ user?: CurrentUserPayload }>();
    const user = request.user;

    if (data && user) {
      return user[data];
    }

    return user;
  },
);
