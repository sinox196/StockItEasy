import { Controller, Get, Module, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { paginationQuery, setPlanSchema } from '@stockiteasy/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, SuperAdminOnly } from '../../common/context';
import { pageArgs, paginated } from '../../common/pagination';
import { ApiZodBody, ZBody, ZQuery } from '../../common/zod';
import { PrismaService } from '../../prisma/prisma.service';
import { PLAN_QUOTAS } from '../organizations/sector-templates';

/** SaaS super-admin console: tenants, plans and quotas. No payment provider is connected. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('organizations')
  @SuperAdminOnly()
  async organizations(@ZQuery(paginationQuery) q: z.infer<typeof paginationQuery>) {
    const where = q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {};
    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(q),
        include: { subscription: true, _count: { select: { members: true, warehouses: true, products: true } } },
      }),
      this.prisma.organization.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  @Put('organizations/:id/plan')
  @SuperAdminOnly()
  @ApiZodBody(setPlanSchema)
  async setPlan(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(setPlanSchema) body: z.infer<typeof setPlanSchema>) {
    const sub = await this.prisma.subscription.upsert({
      where: { organizationId: id },
      create: { organizationId: id, plan: body.plan, status: 'ACTIVE', ...PLAN_QUOTAS[body.plan] },
      update: { plan: body.plan, status: 'ACTIVE', ...PLAN_QUOTAS[body.plan] },
    });
    await this.audit.log({ organizationId: id, userId: user.userId }, { action: 'admin.set_plan', entityType: 'Subscription', entityId: sub.id, data: body });
    return sub;
  }

  @Get('stats')
  @SuperAdminOnly()
  async stats() {
    const [organizations, users, products, sales] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.user.count(),
      this.prisma.product.count(),
      this.prisma.salesOrder.count(),
    ]);
    return { organizations, users, products, sales };
  }
}

@Module({ controllers: [AdminController] })
export class AdminModule {}
