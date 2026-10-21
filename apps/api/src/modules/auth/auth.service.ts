import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { TokenType } from '@prisma/client';
import { LoginInput, RegisterInput } from '@stockiteasy/shared';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { hashToken, randomToken } from './tokens';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  sessionId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  hashPassword(password: string) {
    // OWASP-recommended argon2id parameters.
    return hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }

  async register(input: RegisterInput, meta: RequestMeta) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw AppError.conflict('EMAIL_TAKEN');
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        passwordHash: await this.hashPassword(input.password),
        locale: input.locale,
      },
    });
    await this.audit.log(null, { action: 'auth.register', entityType: 'User', entityId: user.id, data: { ip: meta.ip } });
    await this.sendVerification(user.id);
    const tokens = await this.issueSession(user.id, 'web', undefined, meta);
    return { user: this.publicUser(user), tokens };
  }

  async login(input: LoginInput, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Same error for unknown e-mail and wrong password; still hash to keep timing similar.
    if (!user) {
      await this.hashPassword(input.password);
      throw AppError.unauthenticated('INVALID_CREDENTIALS');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError('RATE_LIMITED', 429);
    const ok = await verify(user.passwordHash, input.password).catch(() => false);
    if (!ok) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      await this.audit.log(null, { action: 'auth.login_failed', entityType: 'User', entityId: user.id, data: { ip: meta.ip } });
      throw AppError.unauthenticated('INVALID_CREDENTIALS');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const tokens = await this.issueSession(user.id, input.client, input.deviceName, meta);
    await this.audit.log(null, { action: 'auth.login', entityType: 'User', entityId: user.id, data: { client: input.client, ip: meta.ip } });
    return { user: this.publicUser(user), tokens };
  }

  /** Creates a new session (new token family). */
  async issueSession(userId: string, client: string, deviceName: string | undefined, meta: RequestMeta, familyId = randomUUID()) {
    const refreshToken = randomToken(48);
    const expiresAt = new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86400_000);
    const session = await this.prisma.session.create({
      data: {
        userId,
        familyId,
        refreshTokenHash: hashToken(refreshToken),
        client,
        deviceName,
        userAgent: meta.userAgent?.slice(0, 300),
        ip: meta.ip,
        expiresAt,
      },
    });
    return this.tokensFor(userId, session.id, refreshToken, expiresAt);
  }

  private async tokensFor(userId: string, sessionId: string, refreshToken: string, refreshTokenExpiresAt: Date): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync({ sub: userId, sid: sessionId }, { expiresIn: env().ACCESS_TOKEN_TTL_SECONDS });
    return { accessToken, accessTokenExpiresIn: env().ACCESS_TOKEN_TTL_SECONDS, refreshToken, refreshTokenExpiresAt, sessionId };
  }

  /**
   * Refresh-token rotation with reuse detection: each refresh token works once.
   * Presenting an already-rotated token revokes every session of its family.
   */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<IssuedTokens> {
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hashToken(refreshToken) } });
    if (!session) throw AppError.unauthenticated('SESSION_REVOKED');
    if (session.rotatedAt) {
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'refresh_token_reuse' },
      });
      await this.audit.log(null, { action: 'auth.refresh_reuse_detected', entityType: 'Session', entityId: session.id, data: { ip: meta.ip } });
      throw AppError.unauthenticated('SESSION_REVOKED');
    }
    if (session.revokedAt || session.expiresAt < new Date()) throw AppError.unauthenticated('SESSION_REVOKED');

    const newToken = randomToken(48);
    const next = await this.prisma.$transaction(async (tx) => {
      const marked = await tx.session.updateMany({
        where: { id: session.id, rotatedAt: null },
        data: { rotatedAt: new Date(), revokedAt: new Date(), revokedReason: 'rotated' },
      });
      if (marked.count !== 1) throw AppError.unauthenticated('SESSION_REVOKED');
      return tx.session.create({
        data: {
          userId: session.userId,
          familyId: session.familyId,
          refreshTokenHash: hashToken(newToken),
          client: session.client,
          deviceName: session.deviceName,
          userAgent: meta.userAgent?.slice(0, 300) ?? session.userAgent,
          ip: meta.ip ?? session.ip,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
        },
      });
    });
    return this.tokensFor(session.userId, next.id, newToken, next.expiresAt);
  }

  async logout(sessionId: string) {
    const s = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!s) return;
    await this.prisma.session.updateMany({
      where: { familyId: s.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, familyId: true, client: true, deviceName: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true },
    });
    const current = await this.prisma.session.findUnique({ where: { id: currentSessionId }, select: { familyId: true } });
    return sessions.map((s) => ({ ...s, current: s.familyId === current?.familyId }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const s = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!s) throw AppError.notFound();
    await this.prisma.session.updateMany({
      where: { familyId: s.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'revoked_by_user' },
    });
    await this.audit.log(null, { action: 'auth.session_revoked', entityType: 'Session', entityId: sessionId, data: { userId } });
  }

  /* ----------------------------- Tokens by e-mail ----------------------------- */

  private async createEmailToken(userId: string, type: TokenType, ttlMs: number) {
    const token = randomToken(32);
    await this.prisma.emailToken.create({
      data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) },
    });
    return token;
  }

  private async consumeEmailToken(token: string, type: TokenType) {
    const record = await this.prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) throw new AppError('INVALID_TOKEN', 400);
    const res = await this.prisma.emailToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (res.count !== 1) throw new AppError('INVALID_TOKEN', 400);
    return record;
  }

  async sendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return;
    const token = await this.createEmailToken(userId, 'VERIFY_EMAIL', 24 * 3600_000);
    await this.mail.sendTemplate(user.email, user.locale, 'verify', {
      name: user.fullName,
      link: `${env().WEB_URL}/verify-email?token=${token}`,
    });
  }

  async verifyEmail(token: string) {
    const record = await this.consumeEmailToken(token, 'VERIFY_EMAIL');
    await this.prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    await this.audit.log(null, { action: 'auth.email_verified', entityType: 'User', entityId: record.userId });
  }

  /** Always resolves, to avoid revealing which e-mails have an account. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const token = await this.createEmailToken(user.id, 'RESET_PASSWORD', 3600_000);
    await this.mail.sendTemplate(user.email, user.locale, 'reset', {
      name: user.fullName,
      link: `${env().WEB_URL}/reset-password?token=${token}`,
    });
  }

  async resetPassword(token: string, password: string) {
    const record = await this.consumeEmailToken(token, 'RESET_PASSWORD');
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await this.hashPassword(password), failedLogins: 0, lockedUntil: null },
    });
    // A password reset ends every existing session.
    await this.prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'password_reset' },
    });
    await this.audit.log(null, { action: 'auth.password_reset', entityType: 'User', entityId: record.userId });
  }

  async changePassword(userId: string, sessionId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verify(user.passwordHash, current).catch(() => false))) throw AppError.unauthenticated('INVALID_CREDENTIALS');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.hashPassword(next) } });
    const s = await this.prisma.session.findUnique({ where: { id: sessionId } });
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, NOT: { familyId: s?.familyId } },
      data: { revokedAt: new Date(), revokedReason: 'password_changed' },
    });
    await this.audit.log(null, { action: 'auth.password_changed', entityType: 'User', entityId: userId });
  }

  publicUser(u: { id: string; email: string; fullName: string; locale: string; timezone: string; emailVerifiedAt: Date | null; isSuperAdmin: boolean }) {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      locale: u.locale,
      timezone: u.timezone,
      emailVerified: !!u.emailVerifiedAt,
      isSuperAdmin: u.isSuperAdmin,
    };
  }
}
