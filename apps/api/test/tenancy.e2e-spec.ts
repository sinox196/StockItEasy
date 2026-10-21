import { addMember, adjust, API, createOrg, createProduct, createTestApp, OrgSession, registerUser, TestApp } from './helpers';

describe('Multi-tenant isolation & RBAC', () => {
  let t: TestApp;
  let a: OrgSession;
  let b: OrgSession;
  let productA: { id: string };

  beforeAll(async () => {
    t = await createTestApp();
    a = await createOrg(t, 'Alpha');
    b = await createOrg(t, 'Beta');
    productA = await createProduct(t, a, { name: 'Secret Alpha', barcodes: ['1234567890128'] });
    await adjust(t, a, productA.id, '10').expect(201);
  });
  afterAll(async () => t.close());

  it('refuses to act on an organization the user is not a member of', async () => {
    const res = await t.http().get(`${API}/products`).set({ Authorization: b.h.Authorization, 'X-Organization-Id': a.orgId }).expect(403);
    expect(res.body.code).toBe('NOT_A_MEMBER');
  });

  it("never exposes another organization's records through its own tenant", async () => {
    await t.http().get(`${API}/products/${productA.id}`).set(b.h).expect(404);
    const list = await t.http().get(`${API}/products?search=Secret`).set(b.h).expect(200);
    expect(list.body.total).toBe(0);
    await t.http().get(`${API}/products/lookup?code=1234567890128`).set(b.h).expect(404);
    const balances = await t.http().get(`${API}/inventory/balances?productId=${productA.id}`).set(b.h).expect(200);
    expect(balances.body).toEqual([]);
    const movements = await t.http().get(`${API}/inventory/movements?productId=${productA.id}`).set(b.h).expect(200);
    expect(movements.body.total).toBe(0);
  });

  it("cannot move another organization's stock", async () => {
    await adjust(t, b, productA.id, '5', 'OUT', undefined, a.warehouseId).expect(404);
    await t.http().post(`${API}/sales`).set(b.h).send({ warehouseId: b.warehouseId, lines: [{ productId: productA.id, quantity: '1' }], payments: [] }).expect(404);
    await t.http().post(`${API}/transfers`).set(b.h).send({ fromWarehouseId: a.warehouseId, toWarehouseId: b.warehouseId, lines: [{ productId: productA.id, quantity: '1' }] }).expect(404);
    await t.http().patch(`${API}/products/${productA.id}`).set(b.h).send({ name: 'Hacked' }).expect(404);
    const p = await t.prisma.product.findUniqueOrThrow({ where: { id: productA.id } });
    expect(p.name).toBe('Secret Alpha');
  });

  it('allows the same SKU in two organizations but not twice in one', async () => {
    const sku = 'SHARED-SKU';
    await createProduct(t, a, { sku });
    await createProduct(t, b, { sku });
    const dup = await t.http().post(`${API}/products`).set(a.h).send({ name: 'Dup', sku }).expect(409);
    expect(dup.body.code).toBe('SKU_TAKEN');
  });

  it('enforces role permissions server side', async () => {
    const viewer = await addMember(t, a, 'VIEWER');
    await t.http().get(`${API}/products`).set(viewer.h).expect(200);
    const denied = await t.http().post(`${API}/products`).set(viewer.h).send({ name: 'Nope', sku: 'NOPE-1' }).expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');

    const cashier = await addMember(t, a, 'CASHIER');
    await adjust(t, cashier, productA.id, '1', 'OUT').expect(403);
    await t.http().post(`${API}/sales`).set(cashier.h).send({ warehouseId: a.warehouseId, lines: [{ productId: productA.id, quantity: '1' }], payments: [{ method: 'CASH', amount: '17.85' }] }).expect(201);
    await t.http().get(`${API}/audit-logs`).set(cashier.h).expect(403);
  });

  it('applies a customised role immediately and keeps the owner role complete', async () => {
    const employee = await addMember(t, a, 'EMPLOYEE');
    await t.http().post(`${API}/categories`).set(employee.h).send({ name: 'Nouvelle' }).expect(403);
    const roles = await t.http().get(`${API}/organizations/current/roles`).set(a.h).expect(200);
    const emp = roles.body.find((r: { key: string }) => r.key === 'EMPLOYEE');
    await t.http().put(`${API}/organizations/current/roles/${emp.id}`).set(a.h).send({ name: emp.name, permissions: [...emp.permissions, 'categories.create'] }).expect(200);
    await t.http().post(`${API}/categories`).set(employee.h).send({ name: 'Nouvelle' }).expect(201);

    const owner = roles.body.find((r: { key: string }) => r.key === 'OWNER');
    const res = await t.http().put(`${API}/organizations/current/roles/${owner.id}`).set(a.h).send({ name: owner.name, permissions: [] }).expect(200);
    expect(res.body.permissions.length).toBeGreaterThan(50);
  });

  it('keeps at least one active owner', async () => {
    const members = await t.http().get(`${API}/organizations/current/members`).set(a.h).expect(200);
    const me = members.body.members.find((m: { userId: string }) => m.userId === a.userId);
    const res = await t.http().patch(`${API}/organizations/current/members/${me.id}`).set(a.h).send({ status: 'DISABLED' }).expect(409);
    expect(res.body.code).toBe('LAST_OWNER');
  });

  it('disabling a member removes access at once', async () => {
    const viewer = await addMember(t, a, 'VIEWER');
    const members = await t.http().get(`${API}/organizations/current/members`).set(a.h).expect(200);
    const m = members.body.members.find((x: { userId: string }) => x.userId === viewer.userId);
    await t.http().patch(`${API}/organizations/current/members/${m.id}`).set(a.h).send({ status: 'DISABLED' }).expect(200);
    await t.http().get(`${API}/products`).set(viewer.h).expect(403);
  });

  it('invites a collaborator by e-mail who joins with the invited role', async () => {
    const roles = await t.http().get(`${API}/organizations/current/roles`).set(a.h).expect(200);
    const buyer = roles.body.find((r: { key: string }) => r.key === 'BUYER');
    // Starter plan allows 3 users and Alpha already has more members: the quota applies.
    const quota = await t.http().post(`${API}/organizations/current/invitations`).set(a.h).send({ email: 'new.buyer@example.com', roleId: buyer.id }).expect(409);
    expect(quota.body.code).toBe('QUOTA_EXCEEDED');
    // A SaaS super admin upgrades the plan (only super admins can).
    await t.http().put(`${API}/admin/organizations/${a.orgId}/plan`).set(a.h).send({ plan: 'BUSINESS' }).expect(403);
    const admin = await registerUser(t, 'Super Admin');
    await t.prisma.user.update({ where: { id: admin.userId }, data: { isSuperAdmin: true } });
    await t.http().put(`${API}/admin/organizations/${a.orgId}/plan`).set('Authorization', `Bearer ${admin.token}`).send({ plan: 'BUSINESS' }).expect(200);
    await t.http().post(`${API}/organizations/current/invitations`).set(a.h).send({ email: 'new.buyer@example.com', roleId: buyer.id }).expect(201);
    const mail = t.mail.outbox.filter((m) => m.to === 'new.buyer@example.com').pop()!;
    const token = mail.text.match(/token=([\w-]+)/)![1];
    const res = await t.http().post(`${API}/invitations/accept`).send({ token, fullName: 'New Buyer', password: 'Password123' }).expect(201);
    expect(res.body.organizationId).toBe(a.orgId);
    const login = await t.http().post(`${API}/auth/login`).send({ email: 'new.buyer@example.com', password: 'Password123' }).expect(200);
    const me = await t.http().get(`${API}/me`).set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(me.body.organizations[0].role.key).toBe('BUYER');
    await t.http().post(`${API}/invitations/accept`).send({ token, fullName: 'Again', password: 'Password123' }).expect(400);
  });
});
