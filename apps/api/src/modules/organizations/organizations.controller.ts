import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  acceptInvitationSchema,
  createOrganizationSchema,
  inviteMemberSchema,
  updateMemberSchema,
  updateOrganizationSchema,
  upsertRoleSchema,
} from '@stockiteasy/shared';
import { z } from 'zod';
import { AppRequest, AuthUser, Ctx, CurrentUser, Public, RequirePermission, TenantContext, TenantScoped } from '../../common/context';
import { ApiZodBody, ZBody } from '../../common/zod';
import { DemoDataService } from './demo-data.service';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly demo: DemoDataService,
  ) {}

  @Post()
  @ApiZodBody(createOrganizationSchema)
  async create(@CurrentUser() user: AuthUser, @ZBody(createOrganizationSchema) body: z.infer<typeof createOrganizationSchema>) {
    const result = await this.orgs.create(user, body);
    if (body.withDemoData) await this.demo.populate(result.organization.id, user.userId, result.warehouseId);
    return result.organization;
  }

  @Get('current')
  @TenantScoped()
  @ApiHeader({ name: 'X-Organization-Id', required: true })
  current(@Ctx() ctx: TenantContext) {
    return this.orgs.get(ctx);
  }

  @Patch('current')
  @RequirePermission('settings.update')
  @ApiZodBody(updateOrganizationSchema)
  update(@Ctx() ctx: TenantContext, @ZBody(updateOrganizationSchema) body: z.infer<typeof updateOrganizationSchema>) {
    return this.orgs.update(ctx, body);
  }

  @Get('current/usage')
  @RequirePermission('settings.read')
  usage(@Ctx() ctx: TenantContext) {
    return this.orgs.usage(ctx);
  }

  @Get('current/members')
  @RequirePermission('users.read')
  members(@Ctx() ctx: TenantContext) {
    return this.orgs.members(ctx);
  }

  @Post('current/invitations')
  @RequirePermission('users.create')
  @ApiZodBody(inviteMemberSchema)
  invite(@Ctx() ctx: TenantContext, @ZBody(inviteMemberSchema) body: z.infer<typeof inviteMemberSchema>) {
    return this.orgs.invite(ctx, body);
  }

  @Delete('current/invitations/:id')
  @HttpCode(204)
  @RequirePermission('users.delete')
  revokeInvitation(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.revokeInvitation(ctx, id);
  }

  @Patch('current/members/:id')
  @RequirePermission('users.update')
  @ApiZodBody(updateMemberSchema)
  updateMember(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(updateMemberSchema) body: z.infer<typeof updateMemberSchema>) {
    return this.orgs.updateMember(ctx, id, body);
  }

  @Get('current/roles')
  @RequirePermission('users.read')
  roles(@Ctx() ctx: TenantContext) {
    return this.orgs.roles(ctx);
  }

  @Post('current/roles')
  @RequirePermission('users.update')
  @ApiZodBody(upsertRoleSchema)
  createRole(@Ctx() ctx: TenantContext, @ZBody(upsertRoleSchema) body: z.infer<typeof upsertRoleSchema>) {
    return this.orgs.createRole(ctx, body);
  }

  @Put('current/roles/:id')
  @RequirePermission('users.update')
  @ApiZodBody(upsertRoleSchema)
  updateRole(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZBody(upsertRoleSchema) body: z.infer<typeof upsertRoleSchema>) {
    return this.orgs.updateRole(ctx, id, body);
  }

  @Delete('current/roles/:id')
  @HttpCode(204)
  @RequirePermission('users.delete')
  deleteRole(@Ctx() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.deleteRole(ctx, id);
  }
}

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  /** New user accepting an invitation (creates the account). */
  @Public()
  @Post('accept')
  @ApiZodBody(acceptInvitationSchema)
  accept(@ZBody(acceptInvitationSchema) body: z.infer<typeof acceptInvitationSchema>, @Req() req: AppRequest) {
    return this.orgs.acceptInvitation(body, undefined, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  /** Signed-in user accepting an invitation sent to their e-mail. */
  @ApiBearerAuth()
  @Post('accept-existing')
  @ApiZodBody(acceptInvitationSchema)
  acceptExisting(@CurrentUser() user: AuthUser, @ZBody(acceptInvitationSchema) body: z.infer<typeof acceptInvitationSchema>, @Req() req: AppRequest) {
    return this.orgs.acceptInvitation(body, user, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }
}
