import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OAuthProvider } from '@prisma/client';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VkOAuthDto } from './dto/vk-oauth.dto';
import { YandexOAuthDto } from './dto/yandex-oauth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OAuthService } from './oauth/oauth.service';
import type { AuthUser } from './types/auth-response.type';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oauthService: OAuthService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('oauth/vk')
  loginWithVk(@Body() dto: VkOAuthDto) {
    return this.oauthService.loginWithVk(
      {
        accessToken: dto.accessToken,
        silentToken: dto.silentToken,
        uuid: dto.uuid,
      },
      {
        anonymousId: dto.anonymousId,
        acquisitionSource: dto.acquisitionSource,
      },
    );
  }

  @Post('oauth/yandex')
  loginWithYandex(@Body() dto: YandexOAuthDto) {
    return this.oauthService.loginWithYandex(dto.accessToken, {
      anonymousId: dto.anonymousId,
      acquisitionSource: dto.acquisitionSource,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('oauth/vk/link')
  linkVk(@CurrentUser() user: AuthUser, @Body() dto: VkOAuthDto) {
    return this.oauthService.linkVk(user, {
      accessToken: dto.accessToken,
      silentToken: dto.silentToken,
      uuid: dto.uuid,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('oauth/yandex/link')
  linkYandex(@CurrentUser() user: AuthUser, @Body() dto: YandexOAuthDto) {
    return this.oauthService.linkYandex(user, dto.accessToken);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('oauth/:provider')
  @HttpCode(200)
  unlinkOauth(
    @CurrentUser() user: AuthUser,
    @Param('provider') providerRaw: string,
  ) {
    const normalized = providerRaw.trim().toLowerCase();
    const provider =
      normalized === 'vk'
        ? OAuthProvider.VK
        : normalized === 'yandex'
          ? OAuthProvider.YANDEX
          : null;
    if (!provider) {
      return this.oauthService.unlink(user, OAuthProvider.VK).catch(() => {
        throw new (require('@nestjs/common').BadRequestException)(
          'Неизвестный провайдер',
        );
      });
    }
    return this.oauthService.unlink(user, provider);
  }

  @Get('nickname')
  generateNickname() {
    return this.authService.generateNicknameSuggestion();
  }

  @Post('guest')
  guestLogin() {
    return this.authService.guestLogin();
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: LogoutDto) {
    await this.authService.logout(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.getProfileWithLinks(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify-email/request')
  @HttpCode(200)
  requestEmailVerification(@CurrentUser() user: AuthUser) {
    return this.authService.requestEmailVerification(user);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}
