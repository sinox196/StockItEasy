import { Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { addPaymentSchema, createSaleSchema, customerReturnSchema, customerSchema, paginationQuery, salesListQuery } from '@stockiteasy/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantContext } from '../../common/context';
import { ApiZodBody, ApiZodQuery, ZBody, ZQuery } from '../../common/zod';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @RequirePermission('sales.read')
  @ApiZodQuery(salesListQuery)
  list(@Ctx() ctx: TenantContext, @ZQuery(salesListQuery) q: z.infer<typeof salesListQuery>) {
    return this.sales.list(ctx, q);
  }

  @Get(':id')
  @RequirePermission('sales.read')
  get(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.get(ctx, id);
  }

  /** POS checkout / direct sale. Send an Idempotency-Key so a retried checkout is never charged twice. */
  @Post()
  @RequirePermission('sales.create')
  @ApiZodBody(createSaleSchema)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  create(@Ctx() ctx: TenantContext, @ZBody(createSaleSchema) body: z.infer<typeof createSaleSchema>) {
    return this.sales.create(ctx, body);
  }

  @Post(':id/payments')
  @RequirePermission('sales.create')
  @ApiZodBody(addPaymentSchema)
  pay(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(addPaymentSchema) body: z.infer<typeof addPaymentSchema>) {
    return this.sales.addPayment(ctx, id, body);
  }

  @Post(':id/returns')
  @RequirePermission('sales.update')
  @ApiZodBody(customerReturnSchema)
  createReturn(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(customerReturnSchema) body: z.infer<typeof customerReturnSchema>) {
    return this.sales.createReturn(ctx, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('sales.approve')
  cancel(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.cancel(ctx, id);
  }
}

@ApiTags('customers')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('customers')
export class CustomersController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @RequirePermission('customers.read')
  @ApiZodQuery(paginationQuery)
  list(@Ctx() ctx: TenantContext, @ZQuery(paginationQuery) q: z.infer<typeof paginationQuery>) {
    return this.sales.customers(ctx, q);
  }

  @Get(':id')
  @RequirePermission('customers.read')
  get(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.customer(ctx, id);
  }

  @Post()
  @RequirePermission('customers.create')
  @ApiZodBody(customerSchema)
  create(@Ctx() ctx: TenantContext, @ZBody(customerSchema) body: z.infer<typeof customerSchema>) {
    return this.sales.createCustomer(ctx, body);
  }

  @Put(':id')
  @RequirePermission('customers.update')
  @ApiZodBody(customerSchema)
  update(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(customerSchema) body: z.infer<typeof customerSchema>) {
    return this.sales.updateCustomer(ctx, id, body);
  }
}

@Module({ controllers: [SalesController, CustomersController], providers: [SalesService], exports: [SalesService] })
export class SalesModule {}
