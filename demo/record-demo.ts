import { chromium, type Locator, type Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, rename } from 'node:fs/promises';
import * as S from '../src/pages/selectors.js';

/**
 * Records a short Playwright video illustrating the form battery's behaviour
 * against a MOCK model-driven form (demo/mock-form.html). The mock uses the same
 * DOM conventions as Unified Interface, so the suite's real src/pages/selectors.ts
 * locators drive it — this shows how the checks work, NOT a live Dynamics 365 run.
 */
const here = dirname(fileURLToPath(import.meta.url));
const formUrl = pathToFileURL(resolve(here, 'mock-form.html')).href;
const outDir = resolve(here, 'output');

async function caption(page: Page, text: string, holdMs = 1700): Promise<void> {
  await page.evaluate((t) => {
    const el = document.getElementById('caption');
    if (el) el.innerHTML = t;
  }, text);
  await page.waitForTimeout(holdMs);
}

async function highlight(loc: Locator, color = '#2b88d8'): Promise<void> {
  await loc
    .first()
    .evaluate((el, c) => {
      (el as HTMLElement).style.outline = `3px solid ${c}`;
      (el as HTMLElement).style.outlineOffset = '2px';
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, color)
    .catch(() => undefined);
}

async function clearHighlight(loc: Locator): Promise<void> {
  await loc
    .first()
    .evaluate((el) => ((el as HTMLElement).style.outline = 'none'))
    .catch(() => undefined);
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  // Use the pre-installed Chromium if its build differs from the pinned version.
  const executablePath = process.env.DEMO_CHROME_PATH || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();

  // The fields the manifest (formxml) would say belong to this form.
  const discoveredFields = ['name', 'accountnumber', 'telephone1', 'websiteurl', 'revenue'];

  await page.goto(formUrl);

  // --- Check 1: form loads -----------------------------------------------------
  await caption(page, '<b>Check 1</b> · Open the form &mdash; the suite navigates to the new-record URL and waits for it to render');
  await S.formReadyAnchor(page).first().waitFor({ state: 'visible' });

  // --- Check 2: tabs render (and expand for lazy content) ----------------------
  const tabCount = await S.tabButtons(page).count();
  await caption(page, `<b>Check 2</b> · Tabs render &mdash; found <b>${tabCount}</b> tab(s); the suite clicks each so lazy fields materialise`);
  await S.tabButtons(page).nth(1).click();
  await page.waitForTimeout(900);
  await S.tabButtons(page).nth(0).click();
  await page.waitForTimeout(700);

  // --- Check 3: expected fields render -----------------------------------------
  await caption(page, '<b>Check 3</b> · Every field the form&rsquo;s <i>formxml</i> declares must be present in the DOM');
  for (const field of discoveredFields) {
    const present = (await S.fieldControl(page, field).count()) > 0;
    await highlight(S.fieldControl(page, field), present ? '#107c10' : '#a4262c');
    await caption(page, `&nbsp;&nbsp;&bull; <code>${field}</code> &rarr; ${present ? '<b style="color:#4fd1c5">found</b>' : '<b style="color:#ff8a80">MISSING</b>'}`, 750);
    await clearHighlight(S.fieldControl(page, field));
  }

  // --- Check 4a: required field is marked required in the live DOM -------------
  await caption(page, '<b>Check 4</b> · <code>name</code> is required in metadata &mdash; verify the UI marks it required (aria-required)');
  await highlight(S.requiredMarker(page, 'name'), '#a4262c');
  await page.waitForTimeout(1200);
  await clearHighlight(S.fieldControl(page, 'name'));

  // --- Check 4b: empty save is blocked ----------------------------------------
  await caption(page, '<b>Check 4</b> · Press <b>Ctrl+S</b> with the required field empty &mdash; the save must be <b>blocked</b>');
  await page.keyboard.press('Control+s');
  await S.errorNotifications(page).first().waitFor({ state: 'visible' });
  await highlight(S.errorNotifications(page), '#d13438');
  await caption(page, '&nbsp;&nbsp;&rarr; Validation surfaced and no record id in the URL &mdash; required-field enforcement <b style="color:#4fd1c5">passes</b>', 2000);

  // --- Positive path: fill required, save succeeds -----------------------------
  await caption(page, 'Now fill the required field and save again&hellip;');
  await S.fieldInput(page, 'name').fill('Contoso Ltd');
  await page.waitForTimeout(600);
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(1200);
  const savedId = /[?&]id=[0-9a-fA-F-]{36}/.test(page.url());
  await caption(page, `&nbsp;&nbsp;&rarr; Record saved (URL now carries an id: <b>${savedId}</b>) &mdash; the form round-trips`, 2200);

  await caption(page, 'Against your real org, the suite runs this for <b>every form in your selected solution</b>, automatically discovered.', 2600);

  const video = page.video();
  await context.close();
  await browser.close();

  if (video) {
    const tmp = await video.path();
    const finalPath = resolve(outDir, 'd365-suite-demo.webm');
    await rename(tmp, finalPath);
    console.log(`[demo] Video written to ${finalPath}`);
  }
}

main().catch((err: unknown) => {
  console.error('[demo] FAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
