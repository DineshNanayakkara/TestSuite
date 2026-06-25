import type { Locator, Page } from '@playwright/test';

/**
 * ALL brittle, version-dependent Unified Interface DOM selectors live here, in
 * one place, so they are easy to audit and adjust per environment/release.
 *
 * Confidence notes:
 *  - VERIFIED: form field controls expose `data-id` containing the field logical
 *    name, e.g. `account.accountnumber.fieldControl-text-box-text` (entity-prefixed
 *    on some releases) or `accountnumber.fieldControl-...` (un-prefixed on others).
 *    We match both shapes with a fallback chain rather than assuming one.
 *  - VERIFIED: modern Unified Interface renders the main form in the top document
 *    (no iframe); the iframe caveat applies to the legacy web client only.
 *  - VERIFIED: Ctrl+S saves a record.
 *  - BEST-EFFORT: form-ready anchors, the error/notification containers, and the
 *    Save button data-id vary by release; each is a fallback, never the sole signal.
 */

/** A locator for a field's control container, tolerant of prefixed/un-prefixed data-id. */
export function fieldControl(page: Page, logicalName: string): Locator {
  // Anchor on a "." boundary so logical name "name" does not match "fullname".
  return page
    .locator(`[data-id^="${logicalName}.fieldControl"]`)
    .or(page.locator(`[data-id*=".${logicalName}.fieldControl"]`))
    .or(page.locator(`[data-id^="${logicalName}."]`))
    .first();
}

/** The editable input/select inside a field control (best-effort across control types). */
export function fieldInput(page: Page, logicalName: string): Locator {
  const container = page
    .locator(`[data-id^="${logicalName}.fieldControl"]`)
    .or(page.locator(`[data-id*=".${logicalName}.fieldControl"]`))
    .first();
  return container.locator('input, textarea, select, [role="combobox"], [contenteditable="true"]').first();
}

/** All tab buttons. ARIA role is the most stable cross-release handle. */
export function tabButtons(page: Page): Locator {
  return page.getByRole('tab');
}

/** Candidate anchors that indicate a form has rendered. Used as an `.or()` chain. */
export function formReadyAnchor(page: Page): Locator {
  return page
    .getByRole('tab')
    .first()
    .or(page.locator('[data-id="editFormRoot"]'))
    .or(page.locator('[data-id="form-header-container"]'))
    .or(page.locator('[data-id$=".fieldControl-container"]').first());
}

/** The busy/loading shimmer that should disappear once the form is interactive. */
export function loadingIndicator(page: Page): Locator {
  return page
    .locator('[data-id="app-loading"]')
    .or(page.locator('[data-id="shimmerContainer"]'))
    .or(page.locator('[aria-label="Loading"]'));
}

/** The Save command. We prefer the keyboard shortcut; this is a fallback click target. */
export function saveButton(page: Page): Locator {
  return page
    .locator('button[data-id="save"]')
    .or(page.getByRole('menuitem', { name: /^Save$/ }))
    .or(page.getByRole('button', { name: /^Save$/ }))
    .first();
}

/** Error/notification surfaces shown when a save is blocked by validation. */
export function errorNotifications(page: Page): Locator {
  return page
    .locator('[data-id="errorNotifications"]')
    .or(page.locator('[data-id$="-error-message"]'))
    .or(page.locator('[role="alert"]'))
    .or(page.getByText(/required fields|must be filled in|provide a value/i));
}

/** Whether the field input is marked required in the live DOM (aria-required). */
export function requiredMarker(page: Page, logicalName: string): Locator {
  const container = page
    .locator(`[data-id^="${logicalName}.fieldControl"]`)
    .or(page.locator(`[data-id*=".${logicalName}.fieldControl"]`))
    .first();
  return container.locator('[aria-required="true"], [aria-label*="Required"]').first();
}
