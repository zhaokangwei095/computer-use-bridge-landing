import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

// Reuse an existing Playwright installation. No browser automation ships in the site.
const driver = process.env.PLAYWRIGHT_DRIVER;
if (!driver) throw new Error('Set PLAYWRIGHT_DRIVER to an installed playwright-core/index.mjs.');
const { chromium } = await import(pathToFileURL(driver).href);
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4187';
const directory = path.resolve('artifacts/test-results');
await mkdir(directory, { recursive: true });
const results = [];

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('h1').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
  assert.equal(await page.locator('.faq-list details').count(), 6);
  await page.screenshot({ path: path.join(directory, 'desktop-zh.png'), fullPage: true });
  await page.screenshot({ path: path.join(directory, 'hero-zh.png') });

  for (const lang of ['zh', 'en']) {
    await page.goto(`${base}/?lang=${lang}`, { waitUntil: 'networkidle' });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(() => ({
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll('main > *,header,footer')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => el.className),
        brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src),
      }));
      assert.ok(result.documentWidth <= width, `${lang} at ${width}: ${JSON.stringify(result)}`);
      assert.equal(result.brokenImages.length, 0);
      results.push({ language: lang, ...result });
      if (width === 390 || width === 1440) {
        await page.screenshot({ path: path.join(directory, `${width === 390 ? 'mobile' : 'desktop'}-${lang}.png`), fullPage: true });
        if (width === 390) await page.screenshot({ path: path.join(directory, `mobile-hero-${lang}.png`) });
      }
    }
  }

  await page.goto(base + '/?lang=zh');
  for (const client of ['generic', 'qoder', 'dsh', 'claude']) {
    await page.selectOption('#client-select', client);
    await page.locator('[data-copy="config"]').click();
    const expected = await page.locator('#config-code').textContent();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(clipboard.replaceAll('\r\n', '\n'), expected);
    assert.ok(!expected.includes('--status'));
  }
  results.push({ configurationSwitchingAndClipboard: 'passed, all 4 clients' });
  await page.locator('[data-stage-button="1"]').click();
  assert.equal(await page.locator('.desktop-scene').getAttribute('data-stage'), '1');
  assert.equal(await page.locator('[data-stage-button="1"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-stage-button="2"]').click();
  assert.match(await page.locator('#demo-detail').textContent(), /重新观察/);
  results.push({ demonstrationStages: 'passed' });

  await page.getByRole('button', { name: 'Switch to English' }).click();
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.goto(base);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.goto(base + '/privacy.html');
  assert.equal(await page.locator('h1').textContent(), 'Privacy');
  await page.goto(base + '/terms.html?lang=zh');
  assert.equal(await page.locator('h1').textContent(), '使用说明');
  results.push({ languagePersistenceAndLegalPages: 'passed' });

  await page.goto(base + '/?lang=zh');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#menu-toggle').click();
  assert.equal(await page.locator('#mobile-menu').evaluate(el => el.open), true);
  assert.equal(await page.locator('nav').count(), 1);
  await page.screenshot({ path: path.join(directory, 'mobile-menu.png') });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mobile-menu').evaluate(el => el.open), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-toggle');
  await page.locator('#menu-toggle').click();
  await page.locator('#primary-nav a').last().click();
  assert.equal(await page.locator('#mobile-menu').evaluate(el => el.open), false);
  assert.match(page.url(), /#setup$/);
  results.push({ mobileMenuKeyboardAndAnchors: 'passed' });

  await page.locator('.faq-list summary').first().focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.faq-list details').first().getAttribute('open'), '');
  const reduce = await page.locator('.reveal').first().evaluate(el => ({ opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform }));
  assert.equal(reduce.opacity, '1');
  assert.equal(reduce.transform, 'none');
  results.push({ faqKeyboardAndReducedMotion: 'passed' });

  const failContext = await browser.newContext();
  await failContext.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Denied'); } } }));
  const failPage = await failContext.newPage();
  await failPage.goto(base);
  await failPage.locator('[data-copy="config"]').click();
  assert.match(await failPage.locator('#copy-status').textContent(), /复制失败/);
  results.push({ clipboardFailureFeedback: 'passed' });
  await failContext.close();

  const response = await context.request.get(base + '/missing-page');
  assert.equal(response.status(), 404);
  assert.match(await response.text(), /data-page="404"/);
  const imageResponse = await context.request.get(base + '/social-card.png');
  assert.equal(imageResponse.status(), 200);
  assert.match(imageResponse.headers()['content-type'], /image\/png/);
  const linkTargets = await page.locator('a[href]').evaluateAll(links => links.map(link => link.getAttribute('href')));
  assert.ok(!linkTargets.includes('#'));
  for (const href of linkTargets.filter(value => value.startsWith('#'))) assert.ok(await page.locator(href).count(), `Missing anchor ${href}`);
  results.push({ notFoundAndInternalLinks: 'passed' });
  const motionContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  const motionPage = await motionContext.newPage();
  await motionPage.goto(base + '/?lang=en');
  await motionPage.locator('.tagline').scrollIntoViewIfNeeded();
  await motionPage.locator('.reveal-word').last().waitFor({ state: 'visible' });
  await motionPage.waitForFunction(() => [...document.querySelectorAll('.reveal-word')].every(el => el.classList.contains('is-visible')));
  await motionPage.locator('#workflow').scrollIntoViewIfNeeded();
  await motionPage.waitForFunction(() => document.querySelector('a[href="#workflow"][aria-current="location"]'));
  results.push({ scrollRevealAndNavigationTracking: 'passed' });
  await motionContext.close();
  assert.deepEqual(errors, [], 'Browser console or runtime errors');
  await writeFile(path.join(directory, 'browser-results.json'), JSON.stringify({ status: 'passed', browser: await browser.version(), results, errors }, null, 2));
  console.log(JSON.stringify({ status: 'passed', checks: results.length, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(directory, 'failure.png'), fullPage: true });
  await writeFile(path.join(directory, 'browser-results.json'), JSON.stringify({ status: 'failed', results, errors, failure: error.message }, null, 2));
  throw error;
} finally {
  await browser.close();
}
