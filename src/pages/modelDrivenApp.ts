import type { Page } from '@playwright/test';
import * as S from './selectors.js';

/**
 * Page object for a model-driven app form. Encapsulates navigation and the
 * resilient interaction primitives the test battery builds on.
 */
export class ModelDrivenApp {
  constructor(
    private readonly page: Page,
    private readonly dataverseUrl: string,
    private readonly appId: string | undefined,
  ) {}

  /**
   * Open a blank "new record" form for an entity, optionally pinned to a specific
   * form by id (so we test every discovered form, not just the entity default).
   *
   * Verified deep-link: main.aspx?appid=<id>&pagetype=entityrecord&etn=<logical>
   * Omitting `id` opens a new record. A specific form is selected via
   * `extraqs=formid=<guid>` (URL-encoded). `appid` is optional but recommended.
   * https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/open-forms-views-dialogs-reports-url
   */
  async openNewRecord(entityLogicalName: string, formId?: string): Promise<void> {
    const params = new URLSearchParams({ pagetype: 'entityrecord', etn: entityLogicalName });
    if (this.appId) params.set('appid', this.appId);
    if (formId) params.set('extraqs', `formid=${formId}`);
    const url = `${this.dataverseUrl}/main.aspx?${params.toString()}`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  /** Wait until the form is rendered and the busy indicator has cleared. */
  async waitForFormReady(timeout = 60_000): Promise<void> {
    await S.formReadyAnchor(this.page).waitFor({ state: 'visible', timeout });
    // Best-effort: let the loading shimmer detach if present.
    await S.loadingIndicator(this.page)
      .first()
      .waitFor({ state: 'detached', timeout: 10_000 })
      .catch(() => {
        /* indicator may never have appeared; ignore */
      });
  }

  /** Click through every tab so lazy-rendered tab content is materialized in the DOM. */
  async expandAllTabs(): Promise<void> {
    const tabs = S.tabButtons(this.page);
    const count = await tabs.count();
    for (let i = 0; i < count; i++) {
      await tabs
        .nth(i)
        .click({ timeout: 5_000 })
        .catch(() => {
          /* a tab may be disabled/hidden by rules; skip */
        });
    }
  }

  /** Number of tab buttons currently rendered. */
  async tabCount(): Promise<number> {
    return S.tabButtons(this.page).count();
  }

  /** Is a field's control present (attached) in the DOM? Expand tabs first for lazy forms. */
  async isFieldPresent(logicalName: string): Promise<boolean> {
    return (await S.fieldControl(this.page, logicalName).count()) > 0;
  }

  /** Is a field marked required in the live DOM (aria-required)? */
  async isFieldRequiredInUi(logicalName: string): Promise<boolean> {
    return (await S.requiredMarker(this.page, logicalName).count()) > 0;
  }

  /** Trigger a save via Ctrl+S (verified shortcut), with a button-click fallback. */
  async save(): Promise<void> {
    await this.page.keyboard.press('Control+s');
    const btn = S.saveButton(this.page);
    if (await btn.count()) {
      await btn.click({ timeout: 3_000 }).catch(() => {
        /* keyboard press likely already saved */
      });
    }
  }

  /** Heuristic: did the record get persisted? A saved record exposes an id in the URL. */
  async wasRecordSaved(): Promise<boolean> {
    // Give the app a moment to navigate/update after a save attempt.
    await this.page.waitForTimeout(2_000);
    const url = this.page.url();
    // A persisted record's deep link contains an id=<guid> parameter.
    return /[?&]id=%7b?[0-9a-fA-F-]{36}/.test(url) || /[?&]id=[0-9a-fA-F-]{36}/.test(url);
  }

  /** Did a validation error/notification surface after a save attempt? */
  async hasValidationError(timeout = 5_000): Promise<boolean> {
    return await S.errorNotifications(this.page)
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }
}
