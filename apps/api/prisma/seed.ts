/**
 * Local demo seed. Creates clearly-labelled demo accounts and one demo organization
 * with generated history. Refuses to run in production.
 *
 *   SEED_DEMO_PASSWORD=MyLocalPass123 pnpm --filter @stockiteasy/api seed
 *
 * Without SEED_DEMO_PASSWORD a random password is generated and printed once.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { randomBytes } from 'crypto';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { DemoDataService } from '../src/modules/organizations/demo-data.service';
import { OrganizationsService } from '../src/modules/organizations/organizations.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Refusing to seed demo data in production.');
  }
  const password = process.env.SEED_DEMO_PASSWORD ?? `Demo-${randomBytes(6).toString('base64url')}1`;
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const auth = app.get(AuthService);
  const orgs = app.get(OrganizationsService);
  const demo = app.get(DemoDataService);

  const accounts = [
    { email: 'owner@demo.stockiteasy.local', fullName: 'Démo Propriétaire', role: 'OWNER' },
    { email: 'cashier@demo.stockiteasy.local', fullName: 'Démo Caissier', role: 'CASHIER' },
    { email: 'stock@demo.stockiteasy.local', fullName: 'Démo Magasinier', role: 'EMPLOYEE' },
    { email: 'admin@demo.stockiteasy.local', fullName: 'Démo Super Admin', role: null },
  ];
  const hash = await auth.hashPassword(password);
  const users: Record<string, string> = {};
  for (const a of accounts) {
    const u = await prisma.user.upsert({
      where: { email: a.email },
      create: { email: a.email, fullName: a.fullName, passwordHash: hash, emailVerifiedAt: new Date(), isSuperAdmin: a.role === null },
      update: { passwordHash: hash },
    });
    users[a.email] = u.id;
  }

  const existing = await prisma.organizationMember.findFirst({ where: { userId: users['owner@demo.stockiteasy.local'] } });
  if (!existing) {
    const { organization, warehouseId } = await orgs.create(
      { userId: users['owner@demo.stockiteasy.local'], sessionId: '', isSuperAdmin: false },
      { name: 'Supérette Démo El Menzah', sector: 'GROCERY', currency: 'TND', city: 'Tunis', firstWarehouseName: 'Dépôt Tunis Central', firstStoreName: 'Magasin El Menzah', withDemoData: true },
    );
    await prisma.warehouse.create({ data: { organizationId: organization.id, name: 'Magasin Sfax (démo)', code: 'SFX', city: 'Sfax' } });
    await prisma.subscription.update({ where: { organizationId: organization.id }, data: { plan: 'BUSINESS', maxUsers: 10, maxWarehouses: 5, maxProducts: 10000 } });
    for (const a of accounts.filter((x) => x.role && x.role !== 'OWNER')) {
      const role = await prisma.role.findFirstOrThrow({ where: { organizationId: organization.id, key: a.role! } });
      await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: users[a.email], roleId: role.id } });
    }
    await demo.populate(organization.id, users['owner@demo.stockiteasy.local'], warehouseId);
  }
  await app.close();

  console.log('\nDemo accounts (local only — DEMO DATA):');
  for (const a of accounts) console.log(`  ${a.email.padEnd(34)} ${a.role ?? 'SUPER_ADMIN'}`);
  console.log(`  password: ${process.env.SEED_DEMO_PASSWORD ? '(from SEED_DEMO_PASSWORD)' : password}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
