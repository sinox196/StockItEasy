import { Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { locationSchema, storeSchema, warehouseSchema } from '@stockiteasy/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantContext } from '../../common/context';
import { ApiZodBody, ZBody } from '../../common/zod';
import { WarehousesService } from './warehouses.service';

@ApiTags('warehouses')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller()
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get('stores')
  @RequirePermission('warehouses.read')
  stores(@Ctx() ctx: TenantContext) {
    return this.warehouses.stores(ctx);
  }

  @Post('stores')
  @RequirePermission('warehouses.create')
  @ApiZodBody(storeSchema)
  createStore(@Ctx() ctx: TenantContext, @ZBody(storeSchema) body: z.infer<typeof storeSchema>) {
    return this.warehouses.createStore(ctx, body);
  }

  @Put('stores/:id')
  @RequirePermission('warehouses.update')
  @ApiZodBody(storeSchema)
  updateStore(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(storeSchema) body: z.infer<typeof storeSchema>) {
    return this.warehouses.updateStore(ctx, id, body);
  }

  @Get('warehouses')
  @RequirePermission('warehouses.read')
  list(@Ctx() ctx: TenantContext) {
    return this.warehouses.list(ctx);
  }

  @Post('warehouses')
  @RequirePermission('warehouses.create')
  @ApiZodBody(warehouseSchema)
  create(@Ctx() ctx: TenantContext, @ZBody(warehouseSchema) body: z.infer<typeof warehouseSchema>) {
    return this.warehouses.create(ctx, body);
  }

  @Put('warehouses/:id')
  @RequirePermission('warehouses.update')
  @ApiZodBody(warehouseSchema)
  update(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(warehouseSchema) body: z.infer<typeof warehouseSchema>) {
    return this.warehouses.update(ctx, id, body);
  }

  @Get('warehouses/:id/locations')
  @RequirePermission('warehouses.read')
  locations(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.warehouses.locations(ctx, id);
  }

  @Post('warehouses/:id/locations')
  @RequirePermission('warehouses.create')
  @ApiZodBody(locationSchema)
  createLocation(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(locationSchema) body: z.infer<typeof locationSchema>) {
    return this.warehouses.createLocation(ctx, id, body);
  }
}
