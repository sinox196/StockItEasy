import { Controller, Get, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { paginationQuery, receiveTransferSchema, transferSchema } from '@stockiteasy/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantContext } from '../../common/context';
import { ApiZodBody, ZBody, ZQuery } from '../../common/zod';
import { TransfersService } from './transfers.service';

@ApiTags('transfers')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @RequirePermission('transfers.read')
  list(@Ctx() ctx: TenantContext, @ZQuery(paginationQuery) q: z.infer<typeof paginationQuery>, @Query('status') status?: string) {
    return this.transfers.list(ctx, { ...q, status });
  }

  @Get(':id')
  @RequirePermission('transfers.read')
  get(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.get(ctx, id);
  }

  @Post()
  @RequirePermission('transfers.create')
  @ApiZodBody(transferSchema)
  create(@Ctx() ctx: TenantContext, @ZBody(transferSchema) body: z.infer<typeof transferSchema>) {
    return this.transfers.create(ctx, body);
  }

  @Post(':id/ship')
  @RequirePermission('transfers.update')
  ship(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.ship(ctx, id);
  }

  @Post(':id/receive')
  @RequirePermission('transfers.update')
  @ApiZodBody(receiveTransferSchema)
  receive(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(receiveTransferSchema) body: z.infer<typeof receiveTransferSchema>) {
    return this.transfers.receive(ctx, id, body);
  }

  @Post(':id/cancel')
  @RequirePermission('transfers.approve')
  cancel(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.cancel(ctx, id);
  }
}

@Module({ controllers: [TransfersController], providers: [TransfersService] })
export class TransfersModule {}
