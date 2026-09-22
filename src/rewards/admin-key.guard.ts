import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = String(request.headers['x-admin-key'] ?? '').trim();
    const expected =
      this.config.get<string>('ADMIN_API_KEY')?.trim() ||
      this.config.get<string>('ADMIN_PASSWORD')?.trim() ||
      '';

    if (!expected || !provided || provided !== expected) {
      throw new UnauthorizedException('Нужен ключ администратора');
    }

    return true;
  }
}
