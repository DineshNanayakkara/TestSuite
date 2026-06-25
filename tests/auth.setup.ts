import { test as setup, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * UI auth setup. A Playwright "setup" project that the form tests depend on.
 *
 * A Dataverse service principal CANNOT sign in to the web UI, so the browser
 * session needs a real user. Two modes (UI_AUTH_MODE):
 *   - storageState (default): reuse an existing signed-in session file. If it
 *     already exists we do nothing. Generate one once with:
 *       npx playwright codegen <DATAVERSE_URL>   (then save storage state), or
 *     run this in "credentials" mode once to mint it.
 *   - credentials: best-effort automated sign-in with DATAVERSE_USERNAME/PASSWORD
 *     against login.microsoftonline.com. Works only WITHOUT MFA / Conditional
 *     Access prompts. The Microsoft login DOM changes over time; the selectors
 *     below are best-effort and isolated to this file.
 */
const mode = process.env.UI_AUTH_MODE || 'storageState';
const storageStatePath = process.env.UI_STORAGE_STATE || '.auth/user.json';
const dataverseUrl = (process.env.DATAVERSE_URL || '').replace(/\/+$/, '');

setup('authenticate', async ({ page }) => {
  if (mode === 'storageState') {
    if (!existsSync(storageStatePath)) {
      throw new Error(
        `UI_AUTH_MODE=storageState but no session file at '${storageStatePath}'. ` +
          `Create one (e.g. \`npx playwright codegen ${dataverseUrl || '<DATAVERSE_URL>'}\` then save ` +
          `storage state), or set UI_AUTH_MODE=credentials with DATAVERSE_USERNAME/PASSWORD.`,
      );
    }
    return; // existing session reused via project storageState config
  }

  // --- credentials mode: best-effort interactive login --------------------------
  const username = process.env.DATAVERSE_USERNAME;
  const password = process.env.DATAVERSE_PASSWORD;
  if (!username || !password) {
    throw new Error('UI_AUTH_MODE=credentials requires DATAVERSE_USERNAME and DATAVERSE_PASSWORD.');
  }
  if (!dataverseUrl) throw new Error('DATAVERSE_URL is required.');

  await page.goto(dataverseUrl, { waitUntil: 'domcontentloaded' });

  // Microsoft Entra ID sign-in flow (stable-ish field ids).
  await page.locator('input[type="email"], #i0116').first().fill(username);
  await page.getByRole('button', { name: /Next/i }).click().catch(() => undefined);
  await page.locator('input[type="password"], #i0118').first().fill(password);
  await page.getByRole('button', { name: /Sign in/i }).click();
  // "Stay signed in?" prompt — accept if shown.
  await page
    .getByRole('button', { name: /Yes/i })
    .click({ timeout: 10_000 })
    .catch(() => undefined);

  // Land in the app and persist the session.
  await page.waitForURL(/crm.*\.dynamics\.com/i, { timeout: 60_000 });
  await expect(page).toHaveURL(/dynamics\.com/i);

  if (!existsSync(dirname(storageStatePath))) {
    mkdirSync(dirname(storageStatePath), { recursive: true });
  }
  await page.context().storageState({ path: storageStatePath });
});
