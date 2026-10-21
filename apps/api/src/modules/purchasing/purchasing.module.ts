import { Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  createPurchaseOrderSchema,
  paginationQuery,
  purchaseOrderListQuery,
  receiveGoodsSchema,
  supplierProductSchema,
  supplierSchema,
  updatePurchaseOrderSchema,
} from '@stockiteasy/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantContext } from '../../common/context';
import { ApiZodBody, ApiZodQuery, ZBody, ZQuery } from '../../common/zod';
import { PurchasingService } from './purchasing.service';
import { SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermission('suppliers.read')
  @ApiZodQuery(paginationQuery)
  list(@Ctx() ctx: TenantContext, @ZQuery(paginationQuery) q: z.infer<typeof paginationQuery>) {
    return this.suppliers.list(ctx, q);
  }

  @Get(':id')
  @RequirePermission('suppliers.read')
  get(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.get(ctx, id);
  }

  @Post()
  @RequirePermission('suppliers.create')
  @ApiZodBody(supplierSchema)
  create(@Ctx() ctx: TenantContext, @ZBody(supplierSchema) body: z.infer<typeof supplierSchema>) {
    return this.suppliers.create(ctx, body);
  }

  @Put(':id')
  @RequirePermission('suppliers.update')
  @ApiZodBody(supplierSchema)
  update(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(supplierSchema) body: z.infer<typeof supplierSchema>) {
    return this.suppliers.update(ctx, id, body);
  }

  @Put(':id/products')
  @RequirePermission('suppliers.update')
  @ApiZodBody(supplierProductSchema)
  upsertProduct(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(supplierProductSchema) body: z.infer<typeof supplierProductSchema>) {
    return this.suppliers.upsertProduct(ctx, id, body);
  }

  @Delete(':id/products/:productId')
  @HttpCode(204)
  @RequirePermission('suppliers.update')
  removeProduct(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.suppliers.removeProduct(ctx, id, productId);
  }

  @Get(':id/performance')
  @RequirePermission('suppliers.read')
  performance(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.performance(ctx, id);
  }
}

@ApiTags('purchases')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  @RequirePermission('purchases.read')
  @ApiZodQuery(purchaseOrderListQuery)
  list(@Ctx() ctx: TenantContext, @ZQuery(purchaseOrderListQuery) q: z.infer<typeof purchaseOrderListQuery>) {
    return this.purchasing.list(ctx, q);
  }

  @Get(':id')
  @RequirePermission('purchases.read')
  get(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.get(ctx, id);
  }

  @Post()
  @RequirePermission('purchases.create')
  @ApiZodBody(createPurchaseOrderSchema)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  create(@Ctx() ctx: TenantContext, @ZBody(createPurchaseOrderSchema) body: z.infer<typeof createPurchaseOrderSchema>) {
    return this.purchasing.create(ctx, body);
  }

  @Patch(':id')
  @RequirePermission('purchases.update')
  @ApiZodBody(updatePurchaseOrderSchema)
  update(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(updatePurchaseOrderSchema) body: z.infer<typeof updatePurchaseOrderSchema>) {
    return this.purchasing.update(ctx, id, body);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('purchases.create')
  submit(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.submit(ctx, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('purchases.approve')
  approve(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.approve(ctx, id);
  }

  @Post(':id/send')
  @HttpCode(200)
  @RequirePermission('purchases.approve')
  send(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.markSent(ctx, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('purchases.approve')
  cancel(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasing.cancel(ctx, id);
  }

  @Post(':id/receipts')
  @RequirePermission('purchases.update')
  @ApiZodBody(receiveGoodsSchema)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  receive(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(receiveGoodsSchema) body: z.infer<typeof receiveGoodsSchema>) {
    return this.purchasing.receive(ctx, id, body);
  }

  @Post('receipts/:receiptId/cancel')
  @HttpCode(200)
  @RequirePermission('purchases.approve')
  cancelReceipt(@Ctx() ctx: TenantContext, @Param('receiptId', ParseUUIDPipe) receiptId: string) {
    return this.purchasing.cancelReceipt(ctx, receiptId);
  }
}

@Module({
  controllers: [SuppliersController, PurchasesController],
  providers: [SuppliersService, PurchasingService],
  exports: [SuppliersService, PurchasingService],
})
export class PurchasingModule {}
