import { expect, Page, test } from '@playwright/test';

const PASSWORD = process.env.E2E_PASSWORD ?? 'DemoPass2026';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
}

test('workflow C — a POS sale decreases the stock shown at the till', async ({ page }) => {
  await login(page, 'owner@demo.stockiteasy.local');
  await page.goto('/pos');
  const tile = page.getByRole('button', { name: /Biscuits chocolat 210g/ });
  await expect(tile).toBeVisible();
  const before = Number((await tile.textContent())!.match(/Stock\s*:\s*(\d+)/)![1]);

  await tile.click();
  await expect(page.getByText('Panier', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: /Espèces/ }).click();
  await page.getByRole('button', { name: /^= / }).click();
  await page.getByRole('button', { name: /Encaisser/ }).last().click();
  await expect(page.getByText(/enregistrée — stock mis à jour/)).toBeVisible();
  await page.getByRole('button', { name: 'Nouvelle vente' }).click();

  await expect(async () => {
    const after = Number((await page.getByRole('button', { name: /Biscuits chocolat 210g/ }).textContent())!.match(/Stock\s*:\s*(\d+)/)![1]);
    expect(after).toBe(before - 1);
  }).toPass({ timeout: 10_000 });
});

test('language switch to Derja applies RTL and is saved in the profile', async ({ page }) => {
  await login(page, 'owner@demo.stockiteasy.local');
  await page.goto('/settings/language');
  await page.getByRole('button', { name: /الدارجة التونسية/ }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('link', { name: 'لوحة التحكّم' })).toBeVisible();
  // Amounts keep Latin digits and left-to-right order.
  await page.goto('/dashboard');
  await expect(page.locator('bdi[dir=ltr]').first()).toBeVisible();
  // Back to French for the other tests.
  await page.goto('/settings/language');
  await page.getByRole('button', { name: /Français/ }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('a cashier only sees the modules their role allows', async ({ page }) => {
  await login(page, 'cashier@demo.stockiteasy.local');
  await expect(page.getByRole('link', { name: 'Caisse tactile' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Utilisateurs & rôles' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: "Journal d'audit" })).toHaveCount(0);
  await page.goto('/users');
  await expect(page.getByText("Vous n'avez pas la permission")).toBeVisible();
});
