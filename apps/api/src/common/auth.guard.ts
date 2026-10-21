import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isPermission } from '@stockiteasy/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppRequest, IS_PUBLIC, PERMISSION, SUPER_ADMIN, TENANT } from './context';
import { AppError } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Global guard:
 * 1. verifies the bearer access token and that its session is still active;
 * 2. for tenant routes, loads the caller's membership in X-Organization-Id and
 *    checks the required permission. Authorization is always decided here,
 *    server side, never by the client.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw AppError.unauthenticated();

    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw AppError.unauthenticated();
    }
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { revokedAt: true, expiresAt: true, user: { select: { id: true, isSuperAdmin: true } } },
    });
    if (!session || session.user.id !== payload.sub || session.revokedAt || session.expiresAt < new Date()) {
      throw AppError.unauthenticated('SESSION_REVOKED');
    }
    req.user = { userId: payload.sub, sessionId: payload.sid, isSuperAdmin: session.user.isSuperAdmin };

    if (this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN, targets)) {
      if (!session.user.isSuperAdmin) throw AppError.forbidden();
      return true;
    }

    const permission = this.reflector.getAllAndOverride<string>(PERMISSION, targets);
    const tenantScoped = this.reflector.getAllAndOverride<boolean>(TENANT, targets);
    if (!permission && !tenantScoped) return true;

    const orgId = req.headers['x-organization-id'];
    if (typeof orgId !== 'string' || !UUID_RE.test(orgId)) throw new AppError('NO_ORGANIZATION', 400);
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: payload.sub } },
      select: { status: true, role: { select: { key: true, permissions: true } } },
    });
    if (!membership || membership.status !== 'ACTIVE') throw AppError.forbidden('NOT_A_MEMBER');

    req.tenant = {
      organizationId: orgId,
      userId: payload.sub,
      roleKey: membership.role.key,
      permissions: membership.role.permissions.filter(isPermission),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
    if (permission && !req.tenant.permissions.includes(permission)) {
      throw AppError.forbidden('FORBIDDEN', { permission });
    }
    return true;
  }
}
