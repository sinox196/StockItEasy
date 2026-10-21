import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Permission } from '@stockiteasy/shared';
import { Request } from 'express';
import { AppError } from './errors';

export interface AuthUser {
  userId: string;
  sessionId: string;
  isSuperAdmin: boolean;
}

/** Resolved for every tenant-scoped request: the organization comes from the X-Organization-Id header. */
export interface TenantContext {
  organizationId: string;
  userId: string;
  roleKey: string | null;
  permissions: string[];
  ip?: string;
  userAgent?: string;
}

export interface AppRequest extends Request {
  id?: string;
  user?: AuthUser;
  tenant?: TenantContext;
}

export const IS_PUBLIC = 'isPublic';
export const PERMISSION = 'permission';
export const TENANT = 'tenant';
export const SUPER_ADMIN = 'superAdmin';

/** Route needs no authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route is tenant-scoped and requires the permission. */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION, permission);
/** Route is tenant-scoped but any active member may call it. */
export const TenantScoped = () => SetMetadata(TENANT, true);
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.user) throw AppError.unauthenticated();
  return req.user;
});

export const Ctx = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.tenant) throw new AppError('NO_ORGANIZATION', 400);
  return req.tenant;
});

export function can(ctx: TenantContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission);
}
