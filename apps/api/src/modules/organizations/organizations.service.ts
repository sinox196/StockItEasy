import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isSupportedLocale } from '@stockiteasy/i18n';
import {
  acceptInvitationSchema,
  ALL_PERMISSIONS,
  CreateOrganizationInput,
  inviteMemberSchema,
  ROLE_KEYS,
  SYSTEM_ROLES,
  updateMemberSchema,
  updateOrganizationSchema,
  upsertRoleSchema,
} from '@stockiteasy/shared';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import { AuthUser, TenantContext } from '../../common/context';
import { AppError } from '../../common/errors';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { hashToken, randomToken } from '../auth/tokens';
import { MailService } from '../mail/mail.service';
import { PLAN_QUOTAS, SECTOR_TEMPLATES } from './sector-templates';

const ROLE_NAMES: Record<string, Record<string, string>> = {
  'fr-TN': {
    OWNER: 'Propriétaire', ADMIN: 'Administrateur', MANAGER: 'Manager', STOCK_MANAGER: 'Responsable stock', BUYER: 'Acheteur',
    CASHIER: 'Commercial / caissier', ACCOUNTANT: 'Comptable', EMPLOYEE: 'Magasinier', VIEWER: 'Lecture seule',
  },
  en: {
    OWNER: 'Owner', ADMIN: 'Administrator', MANAGER: 'Manager', STOCK_MANAGER: 'Stock manager', BUYER: 'Buyer',
    CASHIER: 'Sales / cashier', ACCOUNTANT: 'Accountant', EMPLOYEE: 'Warehouse clerk', VIEWER: 'Read only',
  },
  'ar-TN': {
    OWNER: 'المالك', ADMIN: 'المسؤول', MANAGER: 'المدير', STOCK_MANAGER: 'مسؤول الستوك', BUYER: 'مسؤول الشراءات',
    CASHIER: 'بيّاع / كاسيي', ACCOUNTANT: 'المحاسب', EMPLOYEE: 'خدّام المخزن', VIEWER: 'قراءة برك',
  },
};

function slugify(name: string) {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return `${base || 'org'}-${randomBytes(3).toString('hex')}`;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
  ) {}

  /** Onboarding: organization + system roles + owner membership + subscription + first store/warehouse + sector categories. */
  async create(user: AuthUser, input: CreateOrganizationInput) {
    const owner = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
    const locale = isSupportedLocale(owner.locale) ? owner.locale : 'fr-TN';
    return this.prisma.tx(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.name,
          slug: slugify(input.name),
          sector: input.sector,
          currency: input.currency,
          city: input.city,
          defaultLocale: locale,
          isDemo: input.withDemoData,
        },
      });
      const roles = await this.createSystemRoles(tx, org.id, locale);
      await tx.organizationMember.create({ data: { organizationId: org.id, userId: user.userId, roleId: roles.OWNER } });
      await tx.subscription.create({ data: { organizationId: org.id, plan: 'STARTER', status: 'TRIAL', ...PLAN_QUOTAS.STARTER } });
      let storeId: string | undefined;
      if (input.firstStoreName) {
        const store = await tx.store.create({ data: { organizationId: org.id, name: input.firstStoreName, code: 'MAG1', city: input.city } });
        storeId = store.id;
      }
      const warehouse = await tx.warehouse.create({
        data: { organizationId: org.id, name: input.firstWarehouseName, code: 'DEP1', city: input.city, storeId },
      });
      for (const c of SECTOR_TEMPLATES[input.sector].categories) {
        await tx.productCategory.create({ data: { organizationId: org.id, name: c[locale] } });
      }
      await this.audit.log({ organizationId: org.id, userId: user.userId }, { action: 'organization.create', entityType: 'Organization', entityId: org.id, data: { sector: input.sector } }, tx);
      return { organization: org, warehouseId: warehouse.id };
    });
  }

  async createSystemRoles(tx: Tx, organizationId: string, locale: string) {
    const ids = {} as Record<(typeof ROLE_KEYS)[number], string>;
    for (const key of ROLE_KEYS) {
      const role = await tx.role.create({
        data: { organizationId, key, name: (ROLE_NAMES[locale] ?? ROLE_NAMES['fr-TN'])[key], isSystem: true, permissions: SYSTEM_ROLES[key] },
      });
      ids[key] = role.id;
    }
    return ids;
  }

  async get(ctx: TenantContext) {
    return this.prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, include: { subscription: true } });
  }

  async update(ctx: TenantContext, input: z.infer<typeof updateOrganizationSchema>) {
    const before = await this.prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
    const updated = await this.prisma.organization.update({
      where: { id: ctx.organizationId },
      data: {
        ...input,
        purchaseBudget: input.purchaseBudget === undefined ? undefined : input.purchaseBudget,
        serviceLevel: input.serviceLevel === undefined ? undefined : new Prisma.Decimal(input.serviceLevel),
      },
    });
    const changed = Object.keys(input).filter((k) => String((before as Record<string, unknown>)[k]) !== String((updated as Record<string, unknown>)[k]));
    await this.audit.log(ctx, { action: 'organization.update', entityType: 'Organization', entityId: ctx.organizationId, data: { changed } });
    return updated;
  }

  /* ------------------------------- Members ------------------------------- */

  async members(ctx: TenantContext) {
    const [members, invitations] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where: { organizationId: ctx.organizationId },
        include: { user: { select: { id: true, email: true, fullName: true, lastLoginAt: true } }, role: { select: { id: true, key: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.invitation.findMany({
        where: { organizationId: ctx.organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        include: { role: { select: { id: true, key: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { members, invitations: invitations.map(({ tokenHash: _t, ...i }) => i) };
  }

  async invite(ctx: TenantContext, input: z.infer<typeof inviteMemberSchema>) {
    const role = await this.prisma.role.findFirst({ where: { id: input.roleId, organizationId: ctx.organizationId } });
    if (!role) throw AppError.notFound({ roleId: input.roleId });
    if (role.key === 'OWNER' && ctx.roleKey !== 'OWNER') throw AppError.forbidden();
    await this.assertQuota(ctx.organizationId, 'users');
    const existingUser = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      const member = await this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: ctx.organizationId, userId: existingUser.id } },
      });
      if (member) throw AppError.conflict('EMAIL_TAKEN');
    }
    const token = randomToken(32);
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId: ctx.organizationId,
        email: input.email,
        roleId: role.id,
        tokenHash: hashToken(token),
        invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + 7 * 86400_000),
      },
    });
    const [org, inviter] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } }),
    ]);
    await this.mail.sendTemplate(input.email, existingUser?.locale ?? org.defaultLocale, 'invite', {
      inviter: inviter.fullName,
      organization: org.name,
      link: `${env().WEB_URL}/accept-invitation?token=${token}`,
    });
    await this.audit.log(ctx, { action: 'member.invite', entityType: 'Invitation', entityId: invitation.id, data: { email: input.email, role: role.key ?? role.name } });
    const { tokenHash: _t, ...rest } = invitation;
    return rest;
  }

  async revokeInvitation(ctx: TenantContext, id: string) {
    const res = await this.prisma.invitation.updateMany({
      where: { id, organizationId: ctx.organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count !== 1) throw AppError.notFound();
    await this.audit.log(ctx, { action: 'member.invitation_revoked', entityType: 'Invitation', entityId: id });
  }

  /**
   * Accepting an invitation: an authenticated user joins with their account; an
   * unauthenticated visitor creates an account with the invited e-mail.
   */
  async acceptInvitation(input: z.infer<typeof acceptInvitationSchema>, user: AuthUser | undefined, meta: { ip?: string; userAgent?: string }) {
    const inv = await this.prisma.invitation.findUnique({ where: { tokenHash: hashToken(input.token) } });
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) throw new AppError('INVALID_TOKEN', 400);
    let userId = user?.userId;
    let tokens;
    if (!userId) {
      const existing = await this.prisma.user.findUnique({ where: { email: inv.email } });
      if (existing) throw AppError.unauthenticated();
      if (!input.password || !input.fullName) throw new AppError('VALIDATION_FAILED', 400, { password: 'required', fullName: 'required' });
      const created = await this.prisma.user.create({
        data: {
          email: inv.email,
          fullName: input.fullName,
          passwordHash: await this.auth.hashPassword(input.password),
          emailVerifiedAt: new Date(), // the invitation link proves ownership of the address
        },
      });
      userId = created.id;
      tokens = await this.auth.issueSession(userId, 'web', undefined, meta);
    } else {
      const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (u.email !== inv.email) throw AppError.forbidden();
    }
    await this.prisma.tx(async (tx) => {
      const marked = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      if (marked.count !== 1) throw new AppError('INVALID_TOKEN', 400);
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: inv.organizationId, userId: userId! } },
        create: { organizationId: inv.organizationId, userId: userId!, roleId: inv.roleId },
        update: { roleId: inv.roleId, status: 'ACTIVE' },
      });
      await this.audit.log({ organizationId: inv.organizationId, userId: userId! }, { action: 'member.joined', entityType: 'Invitation', entityId: inv.id }, tx);
    });
    return { organizationId: inv.organizationId, tokens };
  }

  async updateMember(ctx: TenantContext, memberId: string, input: z.infer<typeof updateMemberSchema>) {
    return this.prisma.tx(async (tx) => {
      const member = await tx.organizationMember.findFirst({ where: { id: memberId, organizationId: ctx.organizationId }, include: { role: true } });
      if (!member) throw AppError.notFound();
      let newRole = member.role;
      if (input.roleId) {
        const r = await tx.role.findFirst({ where: { id: input.roleId, organizationId: ctx.organizationId } });
        if (!r) throw AppError.notFound({ roleId: input.roleId });
        newRole = r;
      }
      const touchesOwner = member.role.key === 'OWNER' || newRole.key === 'OWNER';
      if (touchesOwner && ctx.roleKey !== 'OWNER') throw AppError.forbidden();
      const loosesOwner = member.role.key === 'OWNER' && (newRole.key !== 'OWNER' || input.status === 'DISABLED');
      if (loosesOwner) {
        const owners = await tx.organizationMember.count({ where: { organizationId: ctx.organizationId, status: 'ACTIVE', role: { key: 'OWNER' } } });
        if (owners <= 1) throw AppError.conflict('LAST_OWNER');
      }
      const updated = await tx.organizationMember.update({ where: { id: memberId }, data: { roleId: newRole.id, status: input.status } });
      await this.audit.log(ctx, { action: 'member.update', entityType: 'OrganizationMember', entityId: memberId, data: { role: newRole.key ?? newRole.name, status: input.status } }, tx);
      return updated;
    });
  }

  /* -------------------------------- Roles -------------------------------- */

  roles(ctx: TenantContext) {
    return this.prisma.role.findMany({
      where: { organizationId: ctx.organizationId },
      include: { _count: { select: { members: true } } },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createRole(ctx: TenantContext, input: z.infer<typeof upsertRoleSchema>) {
    const role = await this.prisma.role.create({ data: { organizationId: ctx.organizationId, name: input.name, permissions: input.permissions } });
    await this.audit.log(ctx, { action: 'role.create', entityType: 'Role', entityId: role.id, data: input });
    return role;
  }

  async updateRole(ctx: TenantContext, id: string, input: z.infer<typeof upsertRoleSchema>) {
    const role = await this.prisma.role.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!role) throw AppError.notFound();
    const permissions = role.key === 'OWNER' ? ALL_PERMISSIONS : input.permissions;
    const updated = await this.prisma.role.update({ where: { id }, data: { name: input.name, permissions } });
    await this.audit.log(ctx, {
      action: 'role.update',
      entityType: 'Role',
      entityId: id,
      data: {
        added: permissions.filter((p) => !role.permissions.includes(p)),
        removed: role.permissions.filter((p) => !permissions.includes(p)),
      },
    });
    return updated;
  }

  async deleteRole(ctx: TenantContext, id: string) {
    const role = await this.prisma.role.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { _count: { select: { members: true } } } });
    if (!role) throw AppError.notFound();
    if (role.isSystem || role._count.members > 0) throw AppError.conflict('INVALID_STATE');
    await this.prisma.role.delete({ where: { id } });
    await this.audit.log(ctx, { action: 'role.delete', entityType: 'Role', entityId: id });
  }

  /* -------------------------------- Quotas ------------------------------- */

  async assertQuota(organizationId: string, kind: 'users' | 'warehouses' | 'products', client: Tx | PrismaService = this.prisma) {
    const sub = await client.subscription.findUnique({ where: { organizationId } });
    if (!sub) return;
    const limit = kind === 'users' ? sub.maxUsers : kind === 'warehouses' ? sub.maxWarehouses : sub.maxProducts;
    if (limit === null) return;
    const count =
      kind === 'users'
        ? (await client.organizationMember.count({ where: { organizationId, status: { not: 'DISABLED' } } })) +
          (await client.invitation.count({ where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }))
        : kind === 'warehouses'
          ? await client.warehouse.count({ where: { organizationId } })
          : await client.product.count({ where: { organizationId, status: { not: 'ARCHIVED' } } });
    if (count >= limit) throw AppError.conflict('QUOTA_EXCEEDED', { kind, limit });
  }

  async usage(ctx: TenantContext) {
    const [sub, users, warehouses, products] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { organizationId: ctx.organizationId } }),
      this.prisma.organizationMember.count({ where: { organizationId: ctx.organizationId, status: { not: 'DISABLED' } } }),
      this.prisma.warehouse.count({ where: { organizationId: ctx.organizationId } }),
      this.prisma.product.count({ where: { organizationId: ctx.organizationId, status: { not: 'ARCHIVED' } } }),
    ]);
    return { subscription: sub, usage: { users, warehouses, products } };
  }
}
