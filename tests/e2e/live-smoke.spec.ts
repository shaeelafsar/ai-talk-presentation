import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const timestamp = Date.now();

async function expectNoSevereA11yViolations(page) {
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact || '')
  );
  expect(severe, JSON.stringify(severe, null, 2)).toEqual([]);
}

test.describe('AI talk learning hub', () => {
  test('student can navigate hub, presentation, and labs', async ({ page }, testInfo) => {
    const viewport = testInfo.project.name.startsWith('mobile') ? 'mobile' : 'desktop';

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /AI is not magic/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Start Presentation/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Try the Labs/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Better prompts = better answers/i })).toBeVisible();
    await page.screenshot({ path: `tests/e2e/screenshots/${viewport}/hub-${timestamp}.png`, fullPage: true });
    await expectNoSevereA11yViolations(page);

    await page.getByRole('link', { name: /Start Presentation/i }).click();
    await expect(page).toHaveURL(/presentation\.html$/);
    await expect(page.getByText(/AI: The Magic/i)).toBeVisible();
    await page.getByRole('button', { name: /Next slide/i }).click();
    await expect(page.locator('#current')).toHaveText('2');
    await expect(page.locator('.slide.active').getByRole('heading', { name: /Shaeel Afsar/i })).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.getByRole('heading', { name: /Questions/i })).toBeVisible();
    await page.screenshot({ path: `tests/e2e/screenshots/${viewport}/presentation-${timestamp}.png`, fullPage: true });
    await expectNoSevereA11yViolations(page);

    await page.getByRole('link', { name: 'Labs' }).click();
    await expect(page).toHaveURL(/labs\.html$/);
    await expect(page.getByRole('heading', { name: /AI Labs/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /AI Image Generation/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /AI Code Writing/i })).toBeVisible();
    await page.screenshot({ path: `tests/e2e/screenshots/${viewport}/labs-${timestamp}.png`, fullPage: true });
    await expectNoSevereA11yViolations(page);
  });
});
