import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration.
 *
 * Projects:
 *  - "unit"  : pure parser tests (tests/formxml.unit.spec.ts). No browser session,
 *              no env required — runs anywhere, including CI without secrets.
 *  - "setup" : UI authentication (tests/auth.setup.ts) — produces/validates the
 *              signed-in storage state the form tests reuse.
 *  - "forms" : the data-driven form battery (tests/forms.spec.ts), depends on
 *              "setup" and runs with the stored session.
 *
 * NOTE: env is read directly here (not via src/config.ts) so the "unit" project
 * can run without any Dataverse configuration.
 */
const storageStatePath = process.env.UI_STORAGE_STATE || '.auth/user.json';

export default defineConfig({
  testDir: 'tests',
  outputDir: 'artifacts/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/html-report', open: 'never' }],
    ['junit', { outputFile: 'artifacts/results.junit.xml' }],
    ['json', { outputFile: 'artifacts/results.json' }],
  ],
  use: {
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'unit',
      testMatch: /formxml\.unit\.spec\.ts/,
    },
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'forms',
      testMatch: /forms\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: storageStatePath,
      },
    },
  ],
});
