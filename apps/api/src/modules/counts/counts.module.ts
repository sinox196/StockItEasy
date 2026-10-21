import { Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { countLineSchema, createCountSchema, paginationQuery } from '@stockiteasy/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantContext } from '../../common/context';
import { ApiZodBody, ZBody, ZQuery } from '../../common/zod';
import { CountsService } from './counts.service';

@ApiTags('stock-counts')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('stock-counts')
export class CountsController {
  constructor(private readonly counts: CountsService) {}

  @Get()
  @RequirePermission('stock_counts.read')
  list(@Ctx() ctx: TenantContext, @ZQuery(paginationQuery) q: z.infer<typeof paginationQuery>, @Query('status') status?: string) {
    return this.counts.list(ctx, { ...q, status });
  }

  @Get(':id')
  @RequirePermission('stock_counts.read')
  get(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.counts.get(ctx, id);
  }

  @Post()
  @RequirePermission('stock_counts.create')
  @ApiZodBody(createCountSchema)
  create(@Ctx() ctx: TenantContext, @ZBody(createCountSchema) body: z.infer<typeof createCountSchema>) {
    return this.counts.create(ctx, body);
  }

  @Put(':id/lines')
  @RequirePermission('stock_counts.update')
  @ApiZodBody(countLineSchema)
  record(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(countLineSchema) body: z.infer<typeof countLineSchema>) {
    return this.counts.recordLine(ctx, id, body);
  }

  @Post(':id/validate')
  @RequirePermission('stock_counts.approve')
  validate(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.counts.validate(ctx, id);
  }

  @Post(':id/cancel')
  @HttpCode(204)
  @RequirePermission('stock_counts.approve')
  cancel(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.counts.cancel(ctx, id);
  }
}

@Module({ controllers: [CountsController], providers: [CountsService], exports: [CountsService] })
export class CountsModule {}
