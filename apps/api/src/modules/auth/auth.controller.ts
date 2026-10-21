import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '@stockiteasy/shared';
import { Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppRequest, AuthUser, CurrentUser, Public } from '../../common/context';
import { AppError } from '../../common/errors';
import { ApiZodBody, ZBody } from '../../common/zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService, IssuedTokens } from './auth.service';

export const REFRESH_COOKIE = 'sie_rt';
const authLimit = () => ({ default: { limit: env().AUTH_RATE_LIMIT_PER_MINUTE, ttl: 60_000 } });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  private meta(req: AppRequest) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  /** Web clients get the refresh token as an httpOnly cookie; mobile clients in the body (stored in SecureStore). */
  private respond(res: Response, client: string, tokens: IssuedTokens, extra: Record<string, unknown> = {}) {
    const body: Record<string, unknown> = {
      ...extra,
      accessToken: tokens.accessToken,
      accessTokenExpiresIn: tokens.accessTokenExpiresIn,
    };
    if (client === 'mobile') {
      body.refreshToken = tokens.refreshToken;
    } else {
      res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
        httpOnly: true,
        secure: env().COOKIE_SECURE || env().NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth',
        expires: tokens.refreshTokenExpiresAt,
      });
    }
    return body;
  }

  @Public()
  @Throttle(authLimit())
  @Post('register')
  @ApiZodBody(registerSchema)
  async register(@ZBody(registerSchema) body: z.infer<typeof registerSchema>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.register(body, this.meta(req));
    return this.respond(res, 'web', tokens, { user });
  }

  @Public()
  @Throttle(authLimit())
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginSchema)
  async login(@ZBody(loginSchema) body: z.infer<typeof loginSchema>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.login(body, this.meta(req));
    return this.respond(res, body.client, tokens, { user });
  }

  @Public()
  @Throttle(authLimit())
  @Post('refresh')
  @HttpCode(200)
  @ApiZodBody(refreshSchema)
  async refresh(@ZBody(refreshSchema) body: z.infer<typeof refreshSchema>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const token = body.refreshToken ?? fromCookie;
    if (!token) throw AppError.unauthenticated();
    try {
      const tokens = await this.auth.refresh(token, this.meta(req));
      return this.respond(res, body.refreshToken ? 'mobile' : 'web', tokens);
    } catch (e) {
      if (!body.refreshToken) res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      throw e;
    }
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Public()
  @Throttle(authLimit())
  @Post('forgot-password')
  @HttpCode(202)
  @ApiZodBody(forgotPasswordSchema)
  async forgot(@ZBody(forgotPasswordSchema) body: z.infer<typeof forgotPasswordSchema>) {
    await this.auth.forgotPassword(body.email);
    return { accepted: true };
  }

  @Public()
  @Throttle(authLimit())
  @Post('reset-password')
  @HttpCode(204)
  @ApiZodBody(resetPasswordSchema)
  async reset(@ZBody(resetPasswordSchema) body: z.infer<typeof resetPasswordSchema>) {
    await this.auth.resetPassword(body.token, body.password);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(204)
  @ApiZodBody(verifyEmailSchema)
  async verify(@ZBody(verifyEmailSchema) body: z.infer<typeof verifyEmailSchema>) {
    await this.auth.verifyEmail(body.token);
  }

  @ApiBearerAuth()
  @Throttle(authLimit())
  @Post('resend-verification')
  @HttpCode(202)
  async resend(@CurrentUser() user: AuthUser) {
    await this.auth.sendVerification(user.userId);
    return { accepted: true };
  }

  @ApiBearerAuth()
  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user.userId, user.sessionId);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @HttpCode(204)
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.auth.revokeSession(user.userId, id);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(204)
  @ApiZodBody(changePasswordSchema)
  changePassword(@CurrentUser() user: AuthUser, @ZBody(changePasswordSchema) body: z.infer<typeof changePasswordSchema>) {
    return this.auth.changePassword(user.userId, user.sessionId, body.currentPassword, body.newPassword);
  }
}

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** Current user with organizations, roles and effective permissions. */
  @Get()
  async me(@CurrentUser() current: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: current.userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            organization: { select: { id: true, name: true, sector: true, currency: true, timezone: true, defaultLocale: true, isDemo: true } },
            role: { select: { id: true, key: true, name: true, permissions: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      user: this.auth.publicUser(user),
      organizations: user.memberships.map((m) => ({ ...m.organization, role: m.role })),
    };
  }

  @Patch()
  @ApiZodBody(updateProfileSchema)
  async update(@CurrentUser() current: AuthUser, @ZBody(updateProfileSchema) body: z.infer<typeof updateProfileSchema>) {
    const user = await this.prisma.user.update({ where: { id: current.userId }, data: body });
    return this.auth.publicUser(user);
  }
}
