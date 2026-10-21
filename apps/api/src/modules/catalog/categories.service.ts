import { Injectable } from '@nestjs/common';
import { categorySchema } from '@stockiteasy/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { TenantContext } from '../../common/context';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext) {
    const cats = await this.prisma.productCategory.findMany({
      where: { organizationId: ctx.organizationId },
      include: { _count: { select: { products: { where: { status: { not: 'ARCHIVED' } } } } } },
      orderBy: { name: 'asc' },
    });
    return cats.map(({ _count, ...c }) => ({ ...c, productsCount: _count.products }));
  }

  private async assertUnique(ctx: TenantContext, name: string, parentId: string | null | undefined, exceptId?: string) {
    const dup = await this.prisma.productCategory.findFirst({
      where: { organizationId: ctx.organizationId, parentId: parentId ?? null, name: { equals: name, mode: 'insensitive' }, NOT: exceptId ? { id: exceptId } : undefined },
    });
    if (dup) throw AppError.conflict('CODE_TAKEN');
    if (parentId && !(await this.prisma.productCategory.findFirst({ where: { id: parentId, organizationId: ctx.organizationId } }))) {
      throw AppError.notFound({ parentId });
    }
  }

  async create(ctx: TenantContext, input: z.infer<typeof categorySchema>) {
    await this.assertUnique(ctx, input.name, input.parentId);
    const c = await this.prisma.productCategory.create({ data: { organizationId: ctx.organizationId, name: input.name, parentId: input.parentId ?? null } });
    await this.audit.log(ctx, { action: 'category.create', entityType: 'ProductCategory', entityId: c.id, data: input });
    return c;
  }

  async update(ctx: TenantContext, id: string, input: z.infer<typeof categorySchema>) {
    const c = await this.prisma.productCategory.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!c) throw AppError.notFound();
    if (input.parentId === id) throw new AppError('VALIDATION_FAILED', 400, { parentId: 'self' });
    await this.assertUnique(ctx, input.name, input.parentId, id);
    const updated = await this.prisma.productCategory.update({ where: { id }, data: { name: input.name, parentId: input.parentId ?? null } });
    await this.audit.log(ctx, { action: 'category.update', entityType: 'ProductCategory', entityId: id, data: input });
    return updated;
  }

  async remove(ctx: TenantContext, id: string) {
    const c = await this.prisma.productCategory.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!c) throw AppError.notFound();
    if (c._count.products > 0 || c._count.children > 0) throw AppError.conflict('HAS_HISTORY');
    await this.prisma.productCategory.delete({ where: { id } });
    await this.audit.log(ctx, { action: 'category.delete', entityType: 'ProductCategory', entityId: id });
  }
}
