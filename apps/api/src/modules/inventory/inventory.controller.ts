import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { adjustmentSchema, blockStockSchema, movementListQuery, reservationSchema } from '@stockiteasy/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantContext } from '../../common/context';
import { ApiZodBody, ApiZodQuery, ZBody, ZQuery } from '../../common/zod';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('balances')
  @RequirePermission('inventory.read')
  balances(@Ctx() ctx: TenantContext, @Query('productId') productId?: string, @Query('warehouseId') warehouseId?: string) {
    return this.inventory.balances(ctx, { productId, warehouseId });
  }

  @Get('movements')
  @RequirePermission('inventory.read')
  @ApiZodQuery(movementListQuery)
  movements(@Ctx() ctx: TenantContext, @ZQuery(movementListQuery) q: z.infer<typeof movementListQuery>) {
    return this.inventory.movements(ctx, q);
  }

  @Post('adjustments')
  @RequirePermission('inventory.create')
  @ApiZodBody(adjustmentSchema)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  adjust(@Ctx() ctx: TenantContext, @ZBody(adjustmentSchema) body: z.infer<typeof adjustmentSchema>) {
    return this.inventory.adjust(ctx, body);
  }

  @Post('blocks')
  @RequirePermission('inventory.approve')
  @ApiZodBody(blockStockSchema)
  block(@Ctx() ctx: TenantContext, @ZBody(blockStockSchema) body: z.infer<typeof blockStockSchema>) {
    return this.inventory.block(ctx, body);
  }

  @Get('reservations')
  @RequirePermission('inventory.read')
  reservations(@Ctx() ctx: TenantContext) {
    return this.inventory.listReservations(ctx);
  }

  @Post('reservations')
  @RequirePermission('inventory.create')
  @ApiZodBody(reservationSchema)
  reserve(@Ctx() ctx: TenantContext, @ZBody(reservationSchema) body: z.infer<typeof reservationSchema>) {
    return this.inventory.reserve(ctx, body);
  }

  @Post('reservations/:id/release')
  @RequirePermission('inventory.create')
  release(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.releaseReservation(ctx, id);
  }

  @Get('lots/:productId')
  @RequirePermission('inventory.read')
  lots(@Ctx() ctx: TenantContext, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.inventory.lots(ctx, productId);
  }
}
