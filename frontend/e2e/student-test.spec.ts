import { expect, test } from '@playwright/test';

test.describe('Student live test', () => {
  test('loads student UI with mocked session payload', async ({ page }) => {
    await page.route('**/api/v1/live-tests/sess_e2e/**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            topic: 'E2E Anatomiya',
            created_at_ms: Date.now(),
            is_closed: false,
            questions: [
              {
                question: 'Qaysi organ qon aylantiradi?',
                options: ['Yurak', 'Buyrak', 'Jigar'],
              },
            ],
          }),
        });
        return;
      }
      if (route.request().method() === 'POST' && route.request().url().includes('/drafts/')) {
        await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.continue();
    });

    await page.goto('/?mode=student&sid=sess_e2e');

    await expect(page.getByRole('heading', { name: 'Talaba testi' })).toBeVisible();
    await expect(page.getByText('E2E Anatomiya')).toBeVisible();
    await expect(page.getByText(/Qaysi organ qon aylantiradi/i)).toBeVisible();
    await expect(page.getByText('A) Yurak')).toBeVisible();
    await expect(page.getByText(/correctOptionIndex/i)).toHaveCount(0);
  });
});
