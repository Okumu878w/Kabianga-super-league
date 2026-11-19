import { test, expect } from '@playwright/test';
// NOTE: written but NOT executed in the delivery environment (no browser available). Run: npx playwright install && npm run test:e2e
const PUBLIC = ['/', '/competitions', '/fixtures', '/results', '/standings', '/teams', '/players', '/statistics', '/news', '/player-of-the-week', '/team-of-the-week'];
for (const path of PUBLIC) {
  test(`public page ${path} renders without horizontal overflow`, async ({ page }) => {
    const res = await page.goto(path); expect(res?.status()).toBeLessThan(400);
    await expect(page.locator('h1').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, 'page must not scroll sideways').toBe(false);
  });
}
test('mobile shows bottom navigation, desktop shows top navigation', async ({ page, isMobile }) => {
  await page.goto('/'); if (isMobile) await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible(); else await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
});
test('admin and manager areas redirect anonymous visitors to login', async ({ page }) => {
  for (const p of ['/admin', '/admin/fixtures', '/manager', '/manager/squad']) { await page.goto(p); await expect(page).toHaveURL(/\/login/); }
});
test('login validates input and shows a useful error', async ({ page }) => {
  await page.goto('/login'); await page.getByLabel('Email').fill('nobody@example.com'); await page.getByLabel('Password').fill('wrong-password'); await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText(/incorrect|not configured|invalid/i);
});
test('admin export endpoint rejects anonymous users', async ({ request }) => { expect((await request.get('/api/export/standings?s=00000000-0000-0000-0000-000000000000')).status()).toBe(403); });
test('keyboard: skip link is first focusable element', async ({ page }) => { await page.goto('/'); await page.keyboard.press('Tab'); await expect(page.getByText('Skip to content')).toBeFocused(); });
