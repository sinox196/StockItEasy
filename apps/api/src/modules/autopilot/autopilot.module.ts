import { Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { budgetSimulationSchema, decideRecommendationSchema } from '@stockiteasy/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantContext } from '../../common/context';
import { ApiZodBody, ZBody } from '../../common/zod';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { AutopilotService } from './autopilot.service';

@ApiTags('replenishment')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('replenishment')
export class AutopilotController {
  constructor(private readonly autopilot: AutopilotService) {}

  @Get('recommendations')
  @RequirePermission('autopilot.read')
  list(@Ctx() ctx: TenantContext, @Query('status') status?: string) {
    const allowed = ['OPEN', 'APPROVED', 'MODIFIED', 'REJECTED', 'EXPIRED'];
    return this.autopilot.list(ctx, allowed.includes(status ?? '') ? status : 'OPEN');
  }

  @Post('run')
  @HttpCode(200)
  @RequirePermission('autopilot.read')
  run(@Ctx() ctx: TenantContext) {
    return this.autopilot.run(ctx.organizationId);
  }

  @Post('recommendations/:id/decision')
  @HttpCode(200)
  @RequirePermission('autopilot.approve')
  @ApiZodBody(decideRecommendationSchema)
  decide(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(decideRecommendationSchema) body: z.infer<typeof decideRecommendationSchema>) {
    return this.autopilot.decide(ctx, id, body);
  }

  @Post('budget-plan')
  @HttpCode(200)
  @RequirePermission('autopilot.read')
  @ApiZodBody(budgetSimulationSchema)
  budget(@Ctx() ctx: TenantContext, @ZBody(budgetSimulationSchema) body: z.infer<typeof budgetSimulationSchema>) {
    return this.autopilot.budgetPlan(ctx, body.budget);
  }
}

@Module({ imports: [PurchasingModule], controllers: [AutopilotController], providers: [AutopilotService], exports: [AutopilotService] })
export class AutopilotModule {}
