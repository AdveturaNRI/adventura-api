import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Attaches `request.user` when a valid Bearer token is present.
 * Missing or invalid tokens do not fail the request (anonymous access).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
    }>();
    const header = request.headers?.authorization?.trim();
    // No token → skip passport entirely (anonymous).
    if (!header) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error | null, user: TUser): TUser | undefined {
    // Invalid/expired token → treat as anonymous instead of 401.
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}
