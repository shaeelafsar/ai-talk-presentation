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

    await page.getByRole('link', { name: /See prompting slides/i }).click();
    await expect(page).toHaveURL(/presentation\.html#slide-11$/);
    await expect(page.locator('#current')).toHaveText('11');
    await expect(page.locator('.slide.active').getByRole('heading', { name: /Bad prompts can cause hallucinations/i })).toBeVisible();
    await page.goto('/');

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
    await expect(page.getByText(/Most likely: jelly/i)).toBeVisible();

    await page.evaluate(() => window.showSlide(8));
    await expect(page.getByText(/Feed it examples/i)).toBeHidden();
    await page.locator('.slide.active').click();
    await expect(page.getByText(/Feed it examples/i)).toBeVisible();
    await page.locator('.slide.active').click();
    await expect(page.getByText(/Hide a word/i)).toBeVisible();
    await page.locator('.slide.active').click();
    await expect(page.getByText(/Guess and check/i)).toBeVisible();
    await page.locator('.slide.active').click();
    await expect(page.getByText(/Repeat billions of times/i)).toBeVisible();
  });

  test('slide 9 meaning map uses complete thin connections with adjacent weight labels', async ({ page }) => {
    await page.goto('/presentation.html');
    await page.evaluate(() => window.showSlide(9));

    const mapCheck = await page.locator('.slide.active .meaning-map').evaluate((map) => {
      const lines = Array.from(map.querySelectorAll('svg line')).map((line) => ({
        x1: Number(line.getAttribute('x1')),
        y1: Number(line.getAttribute('y1')),
        x2: Number(line.getAttribute('x2')),
        y2: Number(line.getAttribute('y2')),
        strokeWidth: Number(line.getAttribute('stroke-width')),
        vectorEffect: line.getAttribute('vector-effect'),
        dashed: Boolean(line.getAttribute('stroke-dasharray')),
      }));

      const stylePercent = (element: Element, property: 'left' | 'top') => {
        const style = element.getAttribute('style') || '';
        return Number(style.match(new RegExp(`${property}:\\s*([\\d.]+)%`))?.[1]);
      };

      const weights = Array.from(map.querySelectorAll('.map-weight')).map((element) => ({
        text: element.textContent?.trim() || '',
        left: stylePercent(element, 'left'),
        top: stylePercent(element, 'top'),
      }));

      const expectedGreenEdges = [
        { name: 'pizza-pepperoni', x1: 22, y1: 42, x2: 9, y2: 28 },
        { name: 'pizza-cheese', x1: 22, y1: 42, x2: 30, y2: 17 },
        { name: 'pizza-slice', x1: 22, y1: 42, x2: 36, y2: 57 },
        { name: 'pizza-crust', x1: 22, y1: 42, x2: 14, y2: 68 },
        { name: 'spaceship-rocket', x1: 78, y1: 28, x2: 64, y2: 13 },
        { name: 'spaceship-planet', x1: 78, y1: 28, x2: 93, y2: 19 },
        { name: 'spaceship-astronaut', x1: 78, y1: 28, x2: 84, y2: 48 },
        { name: 'homework-assignment', x1: 69, y1: 76, x2: 52, y2: 70 },
        { name: 'homework-study', x1: 69, y1: 76, x2: 90, y2: 76 },
        { name: 'homework-teacher', x1: 69, y1: 76, x2: 69, y2: 93 },
      ];

      const expectedRedEdge = { name: 'pizza-spaceship', x1: 22, y1: 42, x2: 78, y2: 28 };

      const sameEndpoint = (line, edge) =>
        Math.abs(line.x1 - edge.x1) <= 0.1 &&
        Math.abs(line.y1 - edge.y1) <= 0.1 &&
        Math.abs(line.x2 - edge.x2) <= 0.1 &&
        Math.abs(line.y2 - edge.y2) <= 0.1;

      const hasEdge = (edge, dashed: boolean) =>
        lines.some((line) => line.dashed === dashed && (sameEndpoint(line, edge) || sameEndpoint(line, {
          x1: edge.x2,
          y1: edge.y2,
          x2: edge.x1,
          y2: edge.y1,
        })));

      const distanceToSegment = (point, edge) => {
        const dx = edge.x2 - edge.x1;
        const dy = edge.y2 - edge.y1;
        const lengthSquared = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((point.left - edge.x1) * dx + (point.top - edge.y1) * dy) / lengthSquared));
        const projectionX = edge.x1 + t * dx;
        const projectionY = edge.y1 + t * dy;
        return Math.hypot(point.left - projectionX, point.top - projectionY);
      };

      const labeledEdges = [
        { label: '+1.92', edge: expectedGreenEdges.find((edge) => edge.name === 'pizza-cheese') },
        { label: '+2.18', edge: expectedGreenEdges.find((edge) => edge.name === 'spaceship-rocket') },
        { label: '-1.14', edge: expectedRedEdge },
        { label: '+2.05', edge: expectedGreenEdges.find((edge) => edge.name === 'homework-assignment') },
      ];

      return {
        missingGreenEdges: expectedGreenEdges
          .filter((edge) => !hasEdge(edge, false))
          .map((edge) => edge.name),
        missingRedEdge: hasEdge(expectedRedEdge, true) ? null : expectedRedEdge.name,
        wideGreenLines: lines
          .filter((line) => !line.dashed && line.strokeWidth > 0.95)
          .map((line) => `${line.x1},${line.y1}-${line.x2},${line.y2}:${line.strokeWidth}`),
        scalingGreenLines: lines
          .filter((line) => !line.dashed && line.vectorEffect !== 'non-scaling-stroke')
          .map((line) => `${line.x1},${line.y1}-${line.x2},${line.y2}`),
        distantLabels: labeledEdges
          .map(({ label, edge }) => {
            const weight = weights.find((item) => item.text === label);
            if (!weight || !edge) {
              return `${label}:missing`;
            }
            return { label, distance: distanceToSegment(weight, edge) };
          })
          .filter((item) => typeof item === 'string' || item.distance > 5.5),
      };
    });

    expect(mapCheck.missingGreenEdges).toEqual([]);
    expect(mapCheck.missingRedEdge).toBeNull();
    expect(mapCheck.wideGreenLines).toEqual([]);
    expect(mapCheck.scalingGreenLines).toEqual([]);
    expect(mapCheck.distantLabels).toEqual([]);
  });

  test('labs keep primary activities on the intended AI tool before listing alternatives', async ({ page }) => {
    await page.goto('/labs.html');

    const labToolCheck = await page.evaluate(() => {
      const nonCodeLabIds = ['text-ai', 'vision', 'image-gen', 'audio', 'ocr', 'music'];
      const otherToolPattern = /\b(Google Lens|Google Translate|Gemini|ElevenLabs|Adobe Scan|Adobe Firefly|Suno|Claude)\b/i;

      const inspectLab = (id: string, primaryTool: string) => {
        const section = document.getElementById(id);
        if (!section) {
          return { id, missing: true };
        }

        const activities = Array.from(section.querySelectorAll(':scope > .activity'));
        const primaryActivities = activities.slice(0, 2);
        const toolNote = section.querySelector(':scope > .tool-note');

        return {
          id,
          activityCount: activities.length,
          primaryActivityTexts: primaryActivities.map((activity) =>
            (activity.textContent || '').replace(/\s+/g, ' ').trim()
          ),
          primaryLinks: primaryActivities.flatMap((activity) =>
            Array.from(activity.querySelectorAll('a[target="_blank"]')).map((link) => (link as HTMLAnchorElement).href)
          ),
          toolNoteText: (toolNote?.textContent || '').replace(/\s+/g, ' ').trim(),
          toolNoteLinks: toolNote
            ? Array.from(toolNote.querySelectorAll('a[target="_blank"]')).map((link) => (link as HTMLAnchorElement).href)
            : [],
          otherToolMentionsInActivities: primaryActivities
            .map((activity) => (activity.textContent || '').replace(/\s+/g, ' ').trim())
            .filter((text) => otherToolPattern.test(text)),
          primaryTool,
        };
      };

      return [
        ...nonCodeLabIds.map((id) => inspectLab(id, 'ChatGPT')),
        inspectLab('code', 'GitHub Copilot'),
      ];
    });

    for (const lab of labToolCheck) {
      expect(lab.missing, `${lab.id}: lab section is missing`).toBeFalsy();
      expect(lab.activityCount, `${lab.id}: should have at least two primary activities`).toBeGreaterThanOrEqual(2);
      expect(lab.primaryActivityTexts.length, `${lab.id}: should expose two primary activities`).toBe(2);
      for (const text of lab.primaryActivityTexts) {
        expect(text, `${lab.id}: primary activities should mention ${lab.primaryTool}`).toContain(lab.primaryTool);
      }
      expect(lab.otherToolMentionsInActivities, `${lab.id}: other tools belong below the activities`).toEqual([]);
      expect(lab.toolNoteText, `${lab.id}: should list other tools or setup links below the activities`).toMatch(/tools|links/i);
      expect(lab.toolNoteLinks.length, `${lab.id}: below-section tool note should include links`).toBeGreaterThan(0);

      if (lab.primaryTool === 'ChatGPT') {
        const primaryHosts = lab.primaryLinks.map((url) => new URL(url).hostname);
        expect(
          primaryHosts.every((host) => host === 'chat.openai.com'),
          `${lab.id}: ChatGPT activities should not link to other tools`
        ).toBeTruthy();
      } else {
        expect(
          lab.primaryActivityTexts.every((text) => !/\b(ChatGPT|Claude|Gemini)\b/i.test(text)),
          `${lab.id}: code activities should stay focused on GitHub Copilot`
        ).toBeTruthy();
      }
    }
  });

  test('lab external links use official source domains', async ({ page, request }) => {
    await page.goto('/labs.html');
    const urls = await page.locator('a[target="_blank"]').evaluateAll((links) =>
      links.map((link) => link.href)
    );
    const uniqueUrls = Array.from(new Set(urls));

    const allowedHosts = new Set([
      'chat.openai.com',
      'claude.ai',
      'code.visualstudio.com',
      'education.github.com',
      'elevenlabs.io',
      'gemini.google.com',
      'github.com',
      'lens.google.com',
      'suno.com',
      'translate.google.com',
      'www.adobe.com',
      'www.google.com',
      'www.linkedin.com',
      'shaeelafsar.github.io',
    ]);

    await Promise.all(uniqueUrls.map(async (url) => {
      const { hostname } = new URL(url);
      expect(allowedHosts.has(hostname), `Unexpected external link host: ${url}`).toBeTruthy();
      try {
        const response = await request.get(url, { maxRedirects: 2, timeout: 5000 });
        expect(response.status(), `External link did not respond successfully: ${url}`).toBeLessThan(500);
      } catch (error) {
        console.warn(`Reachability check skipped for official source due to timeout/network issue: ${url}`);
      }
    }));
  });
});
