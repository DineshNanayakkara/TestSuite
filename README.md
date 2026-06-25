# Dynamics 365 Generic Form Test Suite (Playwright)

A **solution-agnostic, metadata-driven** UI test suite for Microsoft Dynamics 365
(Dataverse model-driven apps). You pick **one solution** by its unique name; the
suite discovers **every entity and form in that solution** from the Dataverse Web
API and runs a generic battery of UI tests against each form.

Nothing about a specific org, solution, entity, form, or field is hard-coded — and
no expected behaviour is assumed. Every expectation traces to a **concrete
reference**: Dataverse metadata, the form's own `formxml`, or the live rendered DOM.
Anything indeterminate is reported as *skipped with a reason*, never guessed.

> The design brief this implements lives in
> [`prompts/dynamics-365-playwright-test-suite.md`](prompts/dynamics-365-playwright-test-suite.md).

## How it works

```
npm run discover            npx playwright test --project=forms
┌────────────────────┐      ┌─────────────────────────────────────┐
│ Dataverse Web API  │      │ reads artifacts/manifest.json and    │
│  solutions         │      │ generates 1 test per (entity, form): │
│  solutioncomponents│ ───▶ │  1. form loads                       │
│  EntityDefinitions │ JSON │  2. expected tabs render             │
│  systemforms       │ ───▶ │  3. expected fields render           │
│  .../Attributes    │      │  4. required fields enforced         │
│  (formxml parsed)  │      │  5. no console/page errors           │
└────────────────────┘      └─────────────────────────────────────┘
```

Discovery is a **separate step on purpose**: Playwright (1.19+) collects test files
*before* `globalSetup` runs, so the manifest must already exist on disk when the
spec is loaded. `npm run test:full` runs discovery then the tests in one shot.

### The discovery chain (verified Web API references)

| Step | Request | Reference |
|---|---|---|
| Resolve solution | `solutions?$filter=uniquename eq '...'` | [solution](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/solution) |
| Entities in solution | `solutioncomponents` where `componenttype eq 1` | [solutioncomponent](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/solutioncomponent) |
| Entity logical name | `EntityDefinitions(<MetadataId>)` | [query metadata](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api) |
| Forms per entity | `systemforms?$filter=objecttypecode eq '...' and type eq 2 and formactivationstate eq 1` | [systemform](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/systemform) |
| Required levels / types | `EntityDefinitions(LogicalName='...')/Attributes` | [query metadata](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api) |
| Open a specific form | `main.aspx?appid=..&pagetype=entityrecord&etn=..&extraqs=formid=..` | [open with URL](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/open-forms-views-dialogs-reports-url) |
| Save | `Ctrl+S` keyboard shortcut | [keyboard shortcuts](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/basics/keyboard-shortcuts) |

`systemform.type` values used: **2 = Main** (default), 7 = Quick Create, 6 = Quick
View, 11 = Card, 0 = Dashboard, 12 = Main–Interactive (see `src/model/manifest.ts`).

## Prerequisites

- Node.js 20+.
- A **Microsoft Entra ID app registration** with a client secret, and a matching
  **Application User** in Dataverse with read access to solution/form metadata
  (used for discovery via the Web API). See
  [Use OAuth with Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/authenticate-oauth).
- A **real user account** for the browser session (a service principal cannot sign
  in to the model-driven web UI). A dedicated, MFA-exempt test account is easiest.

## Setup

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env     # then fill it in (see comments in the file)
```

Key variables (full list and guidance in `.env.example`):

| Variable | Purpose |
|---|---|
| `DATAVERSE_URL` | Org base URL incl. region, e.g. `https://org.crm.dynamics.com` |
| `DATAVERSE_APP_ID` | Model-driven app id the forms open in (recommended) |
| `SOLUTION_UNIQUE_NAME` | The solution to test (its **Name**, not display name) |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | Service principal for metadata discovery |
| `UI_AUTH_MODE` | `storageState` (reuse a saved session, default) or `credentials` |
| `UI_STORAGE_STATE` | Path to the saved browser session |
| `DATAVERSE_USERNAME` / `DATAVERSE_PASSWORD` | Only for `credentials` mode (no MFA) |
| `FORM_TYPES` | Which form types to test (default `2` = Main) |
| `ACTIVE_ONLY` | Only Active forms (default `true`) |
| `ENTITY_ALLOW` / `ENTITY_DENY` | Optional filters on top of discovery |

### Browser session

- **storageState (recommended):** sign in once and save the session —
  `npx playwright codegen $DATAVERSE_URL`, then save storage state to the path in
  `UI_STORAGE_STATE`. The tests reuse it.
- **credentials:** set `UI_AUTH_MODE=credentials` with username/password; the
  `setup` project signs in and writes the session. Best-effort, only for accounts
  without MFA / Conditional Access prompts.

## Running

```bash
npm run test:unit     # pure formxml parser tests — no org, no secrets needed
npm run discover      # query the org, write artifacts/manifest.json
npm test              # run the form battery against the manifest
npm run test:full     # discover + run forms in one command
npm run test:ui       # Playwright UI mode
npm run report        # open the HTML report
npm run typecheck     # tsc --noEmit
```

## Reports

After a run, see:
- `artifacts/html-report/` — Playwright HTML report (`npm run report`).
- `artifacts/results.junit.xml` and `artifacts/results.json` — machine-readable.
- `artifacts/manifest.json` — exactly what was discovered (entities, forms, fields).

Each `(entity, form)` is its own test. Indeterminate checks attach a
`skipped: <reason>` annotation rather than passing or failing silently.

## What is assumption-free vs best-effort

**Assumption-free (driven by a concrete reference):**
- Which entities/forms exist and which fields/tabs a form declares — from the Web
  API and the form's `formxml`.
- Which fields are required — from attribute `RequiredLevel`.
- Whether an empty form is allowed to save — from the live app (no record id +
  validation surface).

**Best-effort (isolated and documented):**
- The Unified Interface **DOM selectors** (`src/pages/selectors.ts`) — these are
  version-dependent. They use fallback chains and are the first place to adjust if
  a check misbehaves against your release/customizations.
- The `credentials`-mode login DOM (`tests/auth.setup.ts`).
- The create→verify→delete round-trip (off by default; writes data).

## Project layout

```
src/
  config.ts                 # env -> typed, validated config
  model/manifest.ts         # manifest types + verified form-type constants
  model/loadManifest.ts     # sync read at test-collection time
  dataverse/
    auth.ts                 # OAuth client-credentials token
    webapi.ts               # OData v4 client (paged)
    discovery.ts            # solution -> entities -> forms -> fields
    formxml.ts              # pure form-xml parser (unit tested)
    metadata.ts             # attribute metadata + required-level logic
  pages/
    selectors.ts            # ALL brittle UCI selectors, centralized
    modelDrivenApp.ts       # page object: open form, tabs, fields, save
  cli/discover.ts           # writes artifacts/manifest.json
tests/
  auth.setup.ts             # UI sign-in (storageState | credentials)
  forms.spec.ts             # data-driven battery (1 test per entity+form)
  formxml.unit.spec.ts      # pure parser unit tests
playwright.config.ts        # projects: unit / setup / forms
```
