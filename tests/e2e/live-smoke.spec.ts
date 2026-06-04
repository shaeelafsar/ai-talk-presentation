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

  test('all presentation slides are scroll-safe and do not sit behind navigation', async ({ page }) => {
    await page.goto('/presentation.html');
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 1ms !important;
          transition-duration: 1ms !important;
          animation-delay: 0ms !important;
        }
      `,
    });

    const total = Number(await page.locator('#total').innerText());

    for (let slideNumber = 1; slideNumber <= total; slideNumber += 1) {
      await page.evaluate((n) => {
        window.showSlide(n);
        document.querySelector('.slide.active')?.scrollTo(0, 0);
      }, slideNumber);

      await page.waitForTimeout(30);

      const result = await page.evaluate(() => {
        const slide = document.querySelector('.slide.active');
        const nav = document.querySelector('.nav-controls');
        if (!slide || !nav) {
          return { missing: true };
        }

        const slideStyle = getComputedStyle(slide);
        const slideRect = slide.getBoundingClientRect();
        const heading = slide.querySelector('h1,h2');
        const navTop = nav.getBoundingClientRect().top;
        const canScrollIfNeeded =
          slide.scrollHeight <= slide.clientHeight + 1 ||
          ['auto', 'scroll'].includes(slideStyle.overflowY);

        const selectors = [
          'h1',
          'h2',
          'h3',
          'p',
          'li',
          '.card',
          '.card-elevated',
          '.tool-row',
          '.game-prompt',
          '.myth-card',
          '.advice-row',
          '.token-example',
          '.demo-card',
          '.bubble',
        ].join(',');

        const offenders = Array.from(slide.querySelectorAll(selectors))
          .filter((element) => {
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
              return false;
            }

            const rect = element.getBoundingClientRect();
            const visibleTop = Math.max(rect.top, slideRect.top, 0);
            const visibleBottom = Math.min(rect.bottom, slideRect.bottom, window.innerHeight);
            const visibleInViewport = rect.width > 0 && visibleBottom > visibleTop;

            return visibleInViewport && visibleBottom > navTop - 8;
          })
          .map((element) => ({
            text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90),
            bottom: Math.round(Math.min(element.getBoundingClientRect().bottom, slideRect.bottom, window.innerHeight)),
            navTop: Math.round(navTop),
          }));

        return {
          missing: false,
          title: heading?.textContent?.trim().replace(/\s+/g, ' '),
          canScrollIfNeeded,
          overflowY: slideStyle.overflowY,
          scrollHeight: slide.scrollHeight,
          clientHeight: slide.clientHeight,
          headingClippedTop: heading ? heading.getBoundingClientRect().top < Math.max(slideRect.top, 0) - 1 : false,
          headingClippedBottom: heading ? heading.getBoundingClientRect().bottom > Math.min(slideRect.bottom, navTop) + 1 : false,
          offenders,
        };
      });

      expect(result.missing, `slide ${slideNumber}: active slide or nav missing`).toBeFalsy();
      expect(
        result.canScrollIfNeeded,
        `slide ${slideNumber}: content taller than viewport but slide overflowY=${result.overflowY}; scrollHeight=${result.scrollHeight}, clientHeight=${result.clientHeight}`
      ).toBeTruthy();
      expect(result.headingClippedTop, `slide ${slideNumber} heading clipped at top: ${result.title}`).toBeFalsy();
      expect(result.headingClippedBottom, `slide ${slideNumber} heading clipped at bottom: ${result.title}`).toBeFalsy();
      expect(result.offenders, `slide ${slideNumber}: visible content overlaps nav`).toEqual([]);
    }
  });

  test('interactive teaching slides reveal feedback step by step', async ({ page }) => {
    await page.goto('/presentation.html');

    await page.evaluate(() => window.showSlide(3));
    await expect(page.locator('.slide.active')).toContainText('what actually happens');
    await expect(page.getByText(/Not quite — ChatGPT usually is not searching live web/i)).toBeHidden();
    await page.getByRole('button', { name: /It searches the internet/i }).click();
    await expect(page.getByText(/Not quite — ChatGPT usually is not searching live web/i)).toBeVisible();
    await page.getByRole('button', { name: /Something else entirely/i }).click();
    await expect(page.getByText(/Closest — it reads your prompt, then generates an answer/i)).toBeVisible();

    await page.evaluate(() => window.showSlide(4));
    await expect(page.locator('.phone-typed')).toHaveText('');
    await expect(page.locator('.phone-suggestions')).toBeHidden();
    const phoneHeightBeforeSuggestions = await page.locator('.phone-screen').evaluate((element) => element.getBoundingClientRect().height);
    await page.waitForTimeout(1800);
    await expect(page.locator('.phone-typed')).toHaveText("I'm on my");
    await expect(page.locator('.phone-suggestions')).toBeVisible();
    await expect(page.locator('.phone-suggestions')).toContainText('way');
    const phoneHeightAfterSuggestions = await page.locator('.phone-screen').evaluate((element) => element.getBoundingClientRect().height);
    expect(Math.abs(phoneHeightAfterSuggestions - phoneHeightBeforeSuggestions)).toBeLessThanOrEqual(1);
    await expect(page.locator('.phone-typed')).toHaveText('', { timeout: 5000 });
    await expect(page.locator('.phone-suggestions')).toBeHidden();
    await page.waitForTimeout(1800);
    await expect(page.locator('.phone-typed')).toHaveText("I'm on my");
    await expect(page.locator('.phone-suggestions')).toBeVisible();

    await page.evaluate(() => window.showSlide(5));
    await expect(page.getByText(/Most likely: pepperoni/i)).toBeHidden();
    await page.locator('.slide.active').click();
    await expect(page.getByText(/Most likely: pepperoni/i)).toBeVisible();
    await page.locator('.slide.active').click();
    await expect(page.getByText(/Most likely: with you/i)).toBeVisible();
    await page.locator('.slide.active').click();
    await expect(page.getByText(/Most likely: it/i)).toBeVisible();
    await page.locator('.slide.active').click();
    await expect(page.getByText(/Most likely: beyond/i)).toBeVisible();

    await page.evaluate(() => window.showSlide(8));
    await expect(page.getByText(/Feed it text/i)).toBeHidden();
    await page.locator('.slide.active').click();
    await expect(page.getByText(/Feed it text/i)).toBeVisible();
    await page.locator('.slide.active').click();
    await expect(page.getByText(/Hide a word/i)).toBeVisible();
    await page.locator('.slide.active').click();
    await expect(page.getByText(/Check the answer/i)).toBeVisible();
    await page.locator('.slide.active').click();
    await expect(page.getByText(/Repeat billions of times/i)).toBeVisible();
  });
});
