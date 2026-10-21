import { Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { paginationQuery } from '@stockiteasy/shared';
import { z } from 'zod';
import { Ctx, Public, RequirePermission, TenantContext, TenantScoped } from '../../common/context';
import { pageArgs, paginated } from '../../common/pagination';
import { ZQuery } from '../../common/zod';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Organization-wide alerts plus those addressed to the current user. */
  @Get()
  @TenantScoped()
  async list(@Ctx() ctx: TenantContext, @ZQuery(paginationQuery) q: z.infer<typeof paginationQuery>, @Query('unread') unread?: string) {
    const where: Prisma.NotificationWhereInput = {
      organizationId: ctx.organizationId,
      OR: [{ userId: null }, { userId: ctx.userId }],
      readAt: unread === 'true' ? null : undefined,
    };
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { ...paginated(items, total, q), unreadCount };
  }

  @Post(':id/read')
  @HttpCode(204)
  @TenantScoped()
  async read(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.notification.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { readAt: new Date() } });
  }

  @Post('read-all')
  @HttpCode(204)
  @TenantScoped()
  async readAll(@Ctx() ctx: TenantContext) {
    await this.prisma.notification.updateMany({
      where: { organizationId: ctx.organizationId, readAt: null, OR: [{ userId: null }, { userId: ctx.userId }] },
      data: { readAt: new Date() },
    });
  }
}

@ApiTags('audit')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('audit.read')
  async list(
    @Ctx() ctx: TenantContext,
    @ZQuery(paginationQuery) q: z.infer<typeof paginationQuery>,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId: ctx.organizationId,
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      action: q.search ? { contains: q.search } : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.auditLog.count({ where }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.userId).filter((x): x is string => !!x))] } },
      select: { id: true, fullName: true, email: true },
    });
    const um = new Map(users.map((u) => [u.id, u]));
    return paginated(items.map((i) => ({ ...i, user: i.userId ? um.get(i.userId) ?? null : null })), total, q);
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    const started = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'ok', latencyMs: Date.now() - started, time: new Date().toISOString() };
  }
}

@Module({ controllers: [NotificationsController, AuditController, HealthController] })
export class PlatformModule {}
