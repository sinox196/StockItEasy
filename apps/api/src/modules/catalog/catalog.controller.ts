import { Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { categorySchema, createProductSchema, productImportSchema, productListQuery, updateProductSchema } from '@stockiteasy/shared';
import { z } from 'zod';
import { Ctx, RequirePermission, TenantContext } from '../../common/context';
import { ApiZodBody, ApiZodQuery, ZBody, ZQuery } from '../../common/zod';
import { CategoriesService } from './categories.service';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermission('products.read')
  @ApiZodQuery(productListQuery)
  list(@Ctx() ctx: TenantContext, @ZQuery(productListQuery) q: z.infer<typeof productListQuery>) {
    return this.products.list(ctx, q);
  }

  @Get('export.csv')
  @RequirePermission('products.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="products.csv"')
  export(@Ctx() ctx: TenantContext) {
    return this.products.exportCsv(ctx);
  }

  @Get('lookup')
  @RequirePermission('products.read')
  lookup(@Ctx() ctx: TenantContext, @Query('code') code: string, @Query('warehouseId') warehouseId?: string) {
    return this.products.lookup(ctx, code ?? '', warehouseId);
  }

  @Post('import')
  @RequirePermission('products.create')
  @ApiZodBody(productImportSchema)
  import(@Ctx() ctx: TenantContext, @ZBody(productImportSchema) body: z.infer<typeof productImportSchema>) {
    return this.products.import(ctx, body.rows, body.dryRun);
  }

  @Get(':id')
  @RequirePermission('products.read')
  get(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(ctx, id);
  }

  @Post()
  @RequirePermission('products.create')
  @ApiZodBody(createProductSchema)
  create(@Ctx() ctx: TenantContext, @ZBody(createProductSchema) body: z.infer<typeof createProductSchema>) {
    return this.products.create(ctx, body);
  }

  @Patch(':id')
  @RequirePermission('products.update')
  @ApiZodBody(updateProductSchema)
  update(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(updateProductSchema) body: z.infer<typeof updateProductSchema>) {
    return this.products.update(ctx, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('products.delete')
  archive(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.archive(ctx, id);
  }
}

@ApiTags('categories')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermission('categories.read')
  list(@Ctx() ctx: TenantContext) {
    return this.categories.list(ctx);
  }

  @Post()
  @RequirePermission('categories.create')
  @ApiZodBody(categorySchema)
  create(@Ctx() ctx: TenantContext, @ZBody(categorySchema) body: z.infer<typeof categorySchema>) {
    return this.categories.create(ctx, body);
  }

  @Put(':id')
  @RequirePermission('categories.update')
  @ApiZodBody(categorySchema)
  update(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(categorySchema) body: z.infer<typeof categorySchema>) {
    return this.categories.update(ctx, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('categories.delete')
  remove(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(ctx, id);
  }
}
