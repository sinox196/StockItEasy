import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { MailService } from '../src/modules/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestApp {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  prisma: PrismaService;
  mail: MailService;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return {
    app,
    http: () => request(app.getHttpServer()),
    prisma: app.get(PrismaService),
    mail: app.get(MailService),
    close: () => app.close(),
  };
}

export const API = '/api/v1';

export interface Session {
  token: string;
  userId: string;
  email: string;
}

export interface OrgSession extends Session {
  orgId: string;
  warehouseId: string;
  h: Record<string, string>;
}

export async function registerUser(t: TestApp, name = 'Test User'): Promise<Session> {
  const email = `u-${randomUUID().slice(0, 8)}@example.com`;
  const res = await t.http().post(`${API}/auth/register`).send({ fullName: name, email, password: 'Password123', acceptTerms: true }).expect(201);
  return { token: res.body.accessToken, userId: res.body.user.id, email };
}

export async function createOrg(t: TestApp, name = 'Org'): Promise<OrgSession> {
  const s = await registerUser(t, `${name} owner`);
  const org = await t
    .http()
    .post(`${API}/organizations`)
    .set('Authorization', `Bearer ${s.token}`)
    .send({ name, sector: 'GROCERY', firstWarehouseName: `${name} WH` })
    .expect(201);
  const wh = await t.http().get(`${API}/warehouses`).set('Authorization', `Bearer ${s.token}`).set('X-Organization-Id', org.body.id).expect(200);
  return { ...s, orgId: org.body.id, warehouseId: wh.body[0].id, h: { Authorization: `Bearer ${s.token}`, 'X-Organization-Id': org.body.id } };
}

/** Adds a member with a given system role directly (bypassing e-mail invitations). */
export async function addMember(t: TestApp, org: OrgSession, roleKey: string): Promise<OrgSession> {
  const s = await registerUser(t, roleKey);
  const role = await t.prisma.role.findFirstOrThrow({ where: { organizationId: org.orgId, key: roleKey } });
  await t.prisma.organizationMember.create({ data: { organizationId: org.orgId, userId: s.userId, roleId: role.id } });
  return { ...s, orgId: org.orgId, warehouseId: org.warehouseId, h: { Authorization: `Bearer ${s.token}`, 'X-Organization-Id': org.orgId } };
}

let skuCounter = 0;
export async function createProduct(t: TestApp, org: OrgSession, extra: Record<string, unknown> = {}) {
  skuCounter++;
  const res = await t
    .http()
    .post(`${API}/products`)
    .set(org.h)
    .send({ name: `Produit ${skuCounter}`, sku: `SKU-${skuCounter}-${randomUUID().slice(0, 4)}`, purchasePrice: '10', salePrice: '15', minStock: '2', ...extra })
    .expect(201);
  return res.body;
}

export async function stockOf(t: TestApp, org: OrgSession, productId: string, warehouseId = org.warehouseId) {
  const b = await t.prisma.inventoryBalance.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } });
  return {
    onHand: Number(b?.quantityOnHand ?? 0),
    reserved: Number(b?.quantityReserved ?? 0),
    blocked: Number(b?.quantityBlocked ?? 0),
  };
}

export function adjust(t: TestApp, org: OrgSession, productId: string, quantity: string, direction: 'IN' | 'OUT' = 'IN', unitCost?: string, warehouseId = org.warehouseId) {
  return t.http().post(`${API}/inventory/adjustments`).set(org.h).send({ productId, warehouseId, direction, quantity, reason: 'CORRECTION', unitCost });
}
