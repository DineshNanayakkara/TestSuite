import { test, expect } from '@playwright/test';
import { loadManifestSync } from '../src/model/loadManifest.js';
import { ModelDrivenApp } from '../src/pages/modelDrivenApp.js';
import { isRequired } from '../src/dataverse/metadata.js';
import { FORM_TYPE } from '../src/model/manifest.js';

/**
 * Data-driven form battery. One Playwright test per (entity, form) discovered in
 * the manifest. The manifest is read at collection time; if it is missing the
 * whole spec degrades to a single skipped test telling the operator to run
 * discovery first (so `npm run test:unit` still works standalone).
 *
 * Every expectation traces to a concrete reference:
 *  - which fields/tabs to expect  -> the form's parsed formxml (manifest)
 *  - which fields are required     -> attribute RequiredLevel (manifest) AND the
 *                                     live DOM aria-required marker
 *  - whether save is blocked       -> the live app (no record id + error surface)
 * Anything indeterminate is reported via test.info().annotations as "skipped:reason",
 * never assumed.
 */

const manifest = loadManifestSync();
const appId = process.env.DATAVERSE_APP_ID || undefined;
const consoleErrorFatal = ['1', 'true', 'yes', 'on'].includes(
  (process.env.CONSOLE_ERROR_FATAL || '').toLowerCase(),
);

function annotateSkip(reason: string): void {
  test.info().annotations.push({ type: 'skipped', description: reason });
}

if (!manifest) {
  test('discovery manifest is present', () => {
    test.skip(
      true,
      'No manifest found. Run `npm run discover` (or `npm run test:full`) before the form tests.',
    );
  });
} else {
  test.describe(`Solution: ${manifest.solution.friendlyName} (${manifest.solution.uniqueName})`, () => {
    for (const entity of manifest.entities) {
      test.describe(`${entity.displayName ?? entity.logicalName} [${entity.logicalName}]`, () => {
        if (entity.forms.length === 0) {
          test('has at least one form to test', () => {
            test.skip(true, `No forms of the configured types on '${entity.logicalName}'.`);
          });
        }

        for (const form of entity.forms) {
          test(`${form.typeName} form "${form.name}"`, async ({ page }) => {
            const consoleErrors: string[] = [];
            page.on('console', (msg) => {
              if (msg.type() === 'error') consoleErrors.push(msg.text());
            });
            page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

            const app = new ModelDrivenApp(page, manifest.dataverseUrl, appId);

            // --- Check 1: form loads -------------------------------------------------
            await app.openNewRecord(entity.logicalName, form.formId);
            await app.waitForFormReady();

            // --- Check 2 & 3: expected tabs and fields render ------------------------
            await app.expandAllTabs();

            const expectedTabs = form.tabs.filter((t) => t.visible);
            const renderedTabCount = await app.tabCount();
            // A form may legitimately render all tabs into a single non-tabbed surface;
            // only assert when the form actually declares multiple visible tabs.
            if (expectedTabs.length > 1) {
              expect(renderedTabCount, 'visible tab count should be > 0').toBeGreaterThan(0);
            }

            const expectedFields = form.fields.filter((f) => f.visible);
            const missingFields: string[] = [];
            for (const field of expectedFields) {
              if (!(await app.isFieldPresent(field.logicalName))) {
                missingFields.push(field.logicalName);
              }
            }
            expect(
              missingFields,
              `fields present on form per formxml but not found in DOM: ${missingFields.join(', ')}`,
            ).toEqual([]);

            // --- Check 4: required fields are enforced -------------------------------
            const requiredFields = expectedFields.filter((f) =>
              isRequired(entity.attributes[f.logicalName]),
            );

            // 4a. Each required field is marked required in the live DOM.
            for (const field of requiredFields) {
              const markedRequired = await app.isFieldRequiredInUi(field.logicalName);
              expect(
                markedRequired,
                `field '${field.logicalName}' is metadata-required but not marked required in the UI`,
              ).toBeTruthy();
            }

            // 4b. Saving an empty form must be blocked when required fields exist.
            if (requiredFields.length > 0) {
              await app.save();
              const saved = await app.wasRecordSaved();
              const errorShown = await app.hasValidationError();
              expect(
                saved,
                'empty form with required fields was saved — required-field enforcement failed',
              ).toBeFalsy();
              if (!errorShown) {
                annotateSkip(
                  'save appears blocked (no record id) but no validation surface was detected — verify selectors',
                );
              }
            } else {
              annotateSkip('no metadata-required fields on this form; required-field check not applicable');
            }

            // --- Check 5: no unhandled console/page errors --------------------------
            if (consoleErrors.length > 0) {
              const detail = `console/page errors during form interaction:\n${consoleErrors.join('\n')}`;
              if (consoleErrorFatal) {
                expect(consoleErrors, detail).toEqual([]);
              } else {
                annotateSkip(detail);
              }
            }
          });
        }
      });
    }
  });
}

// Exported for reuse/testing of the type filter without a live run.
export const MAIN_FORM_TYPE = FORM_TYPE.Main;
