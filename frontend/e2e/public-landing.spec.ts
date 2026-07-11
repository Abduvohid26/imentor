import { expect, test } from '@playwright/test';

test.describe('Public landing', () => {
  test('shows hero and opens login panel', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Tibbiy ta'lim uchun aqlli platforma/i })).toBeVisible();
    await expect(page.getByText('iMentor', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Kirish' }).first().click();
    await expect(page.getByRole('heading', { name: /iMentor tizimiga kirish/i })).toBeVisible();
    await expect(page.getByPlaceholder('+998 90 123 45 67')).toBeVisible();
  });

  test('public catalog section is reachable from nav', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Ochiq bazasi' }).click();
    await expect(page.locator('#public-catalog-section')).toBeInViewport();
  });
});
