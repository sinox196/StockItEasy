import { API, createTestApp, registerUser, TestApp } from './helpers';

describe('Authentication & sessions', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(async () => t.close());

  it('registers, logs in and returns the profile with French as default locale', async () => {
    const s = await registerUser(t);
    const me = await t.http().get(`${API}/me`).set('Authorization', `Bearer ${s.token}`).expect(200);
    expect(me.body.user.locale).toBe('fr-TN');
    expect(me.body.organizations).toEqual([]);
    const login = await t.http().post(`${API}/auth/login`).send({ email: s.email, password: 'Password123' }).expect(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.headers['set-cookie']?.[0]).toMatch(/sie_rt=.*HttpOnly/);
  });

  it('rejects wrong credentials with a generic error and refuses weak passwords', async () => {
    const s = await registerUser(t);
    const bad = await t.http().post(`${API}/auth/login`).send({ email: s.email, password: 'WrongPass123' }).expect(401);
    expect(bad.body.code).toBe('INVALID_CREDENTIALS');
    const unknown = await t.http().post(`${API}/auth/login`).send({ email: 'nobody@example.com', password: 'WrongPass123' }).expect(401);
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    const weak = await t.http().post(`${API}/auth/register`).send({ fullName: 'X Y', email: 'weak@example.com', password: 'short', acceptTerms: true }).expect(400);
    expect(weak.body.code).toBe('VALIDATION_FAILED');
  });

  it('locks the account after repeated failures', async () => {
    const s = await registerUser(t);
    for (let i = 0; i < 5; i++) await t.http().post(`${API}/auth/login`).send({ email: s.email, password: 'WrongPass123' }).expect(401);
    const locked = await t.http().post(`${API}/auth/login`).send({ email: s.email, password: 'Password123' }).expect(429);
    expect(locked.body.code).toBe('RATE_LIMITED');
  });

  it('rotates refresh tokens and revokes the family when a used token is replayed', async () => {
    const s = await registerUser(t);
    const login = await t.http().post(`${API}/auth/login`).send({ email: s.email, password: 'Password123', client: 'mobile' }).expect(200);
    const rt1 = login.body.refreshToken;
    const r2 = await t.http().post(`${API}/auth/refresh`).send({ refreshToken: rt1 }).expect(200);
    expect(r2.body.refreshToken).not.toBe(rt1);
    // Replay of the already-rotated token = theft signal.
    const replay = await t.http().post(`${API}/auth/refresh`).send({ refreshToken: rt1 }).expect(401);
    expect(replay.body.code).toBe('SESSION_REVOKED');
    // The legitimate new token is revoked too, and so is its access token.
    await t.http().post(`${API}/auth/refresh`).send({ refreshToken: r2.body.refreshToken }).expect(401);
    await t.http().get(`${API}/me`).set('Authorization', `Bearer ${r2.body.accessToken}`).expect(401);
  });

  it('refreshes through the httpOnly cookie for the web client', async () => {
    const s = await registerUser(t);
    const login = await t.http().post(`${API}/auth/login`).send({ email: s.email, password: 'Password123' }).expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const r = await t.http().post(`${API}/auth/refresh`).set('Cookie', cookie).send({}).expect(200);
    expect(r.body.refreshToken).toBeUndefined();
    expect(r.body.accessToken).toBeTruthy();
  });

  it('logout revokes the session', async () => {
    const s = await registerUser(t);
    await t.http().post(`${API}/auth/logout`).set('Authorization', `Bearer ${s.token}`).expect(204);
    await t.http().get(`${API}/me`).set('Authorization', `Bearer ${s.token}`).expect(401);
  });

  it('verifies e-mail and resets password with single-use tokens, ending other sessions', async () => {
    const s = await registerUser(t);
    const verifyMail = t.mail.outbox.filter((m) => m.to === s.email).pop()!;
    expect(verifyMail.subject).toContain('Vérifiez');
    const vtoken = verifyMail.text.match(/token=([\w-]+)/)![1];
    await t.http().post(`${API}/auth/verify-email`).send({ token: vtoken }).expect(204);
    await t.http().post(`${API}/auth/verify-email`).send({ token: vtoken }).expect(400);

    await t.http().post(`${API}/auth/forgot-password`).send({ email: s.email }).expect(202);
    await t.http().post(`${API}/auth/forgot-password`).send({ email: 'unknown@example.com' }).expect(202);
    const reset = t.mail.outbox.filter((m) => m.to === s.email).pop()!;
    const rtoken = reset.text.match(/token=([\w-]+)/)![1];
    await t.http().post(`${API}/auth/reset-password`).send({ token: rtoken, password: 'NewPassword456' }).expect(204);
    await t.http().get(`${API}/me`).set('Authorization', `Bearer ${s.token}`).expect(401);
    await t.http().post(`${API}/auth/login`).send({ email: s.email, password: 'NewPassword456' }).expect(200);
  });

  it('saves the language in the profile (switch during a session)', async () => {
    const s = await registerUser(t);
    await t.http().patch(`${API}/me`).set('Authorization', `Bearer ${s.token}`).send({ locale: 'ar-TN' }).expect(200);
    const me = await t.http().get(`${API}/me`).set('Authorization', `Bearer ${s.token}`).expect(200);
    expect(me.body.user.locale).toBe('ar-TN');
    await t.http().patch(`${API}/me`).set('Authorization', `Bearer ${s.token}`).send({ locale: 'de' }).expect(400);
  });

  it('rejects unauthenticated access and forged tokens', async () => {
    await t.http().get(`${API}/me`).expect(401);
    await t.http().get(`${API}/me`).set('Authorization', 'Bearer abc.def.ghi').expect(401);
  });
});
