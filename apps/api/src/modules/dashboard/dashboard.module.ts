import { Controller, Get, Header, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { dashboardQuery } from '@stockiteasy/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantContext } from '../../common/context';
import { ApiZodQuery, ZQuery } from '../../common/zod';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard/summary')
  @RequirePermission('dashboard.read')
  @ApiZodQuery(dashboardQuery)
  summary(@Ctx() ctx: TenantContext, @ZQuery(dashboardQuery) q: z.infer<typeof dashboardQuery>) {
    return this.dashboard.summary(ctx, q);
  }

  @Get('dashboard/charts')
  @RequirePermission('dashboard.read')
  @ApiZodQuery(dashboardQuery)
  charts(@Ctx() ctx: TenantContext, @ZQuery(dashboardQuery) q: z.infer<typeof dashboardQuery>) {
    return this.dashboard.charts(ctx, q);
  }

  @Get('reports/valuation')
  @RequirePermission('reports.read')
  valuation(@Ctx() ctx: TenantContext, @Query('warehouseId') warehouseId?: string) {
    return this.dashboard.valuation(ctx, warehouseId);
  }

  @Get('reports/valuation.csv')
  @RequirePermission('reports.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="valuation.csv"')
  async valuationCsv(@Ctx() ctx: TenantContext, @Query('warehouseId') warehouseId?: string) {
    const { rows } = await this.dashboard.valuation(ctx, warehouseId);
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '﻿' + ['sku,name,category,onHand,averageCost,value', ...rows.map((r) => [r.sku, r.name, r.category, r.onHand, r.averageCost, r.value].map(esc).join(','))].join('\n');
  }

  @Get('reports/abc')
  @RequirePermission('reports.read')
  abc(@Ctx() ctx: TenantContext, @Query('days') days?: string) {
    return this.dashboard.abc(ctx, Math.min(365, Math.max(7, Number(days) || 90)));
  }

  @Get('reports/dormant')
  @RequirePermission('reports.read')
  dormant(@Ctx() ctx: TenantContext, @Query('minDays') minDays?: string) {
    return this.dashboard.dormant(ctx, Math.min(365, Math.max(1, Number(minDays) || 60)));
  }

  @Get('reports/sales')
  @RequirePermission('reports.read')
  @ApiZodQuery(dashboardQuery)
  sales(@Ctx() ctx: TenantContext, @ZQuery(dashboardQuery) q: z.infer<typeof dashboardQuery>) {
    return this.dashboard.salesByProduct(ctx, q);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
