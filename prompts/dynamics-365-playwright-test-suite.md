# Prompt: Generic Dynamics 365 Form Test Suite (Playwright)

> Copy everything below the line into your coding agent / Claude Code session as the
> task brief. It is written to be **solution-agnostic**: nothing about a specific
> org, solution, entity, or form is hard-coded. The suite discovers what to test at
> runtime from Dataverse metadata.

---

## Role

You are building a **generic, metadata-driven UI test suite for Microsoft Dynamics 365
(Dataverse model-driven apps) using Playwright + TypeScript**.

The operator selects **one solution** (by unique name). The suite then discovers
**every entity (table) in that solution and every form on those entities** and runs a
standard battery of UI tests against each form. No entity names, form names, field
names, or form layouts may be hard-coded.

## Non-negotiable principle: NO ASSUMPTIONS — verify against concrete references

This is the most important rule. Do **not** guess entity logical names, form GUIDs,
field schema names, option-set values, tab/section ids, or which forms exist. Every
one of those must be **read from a concrete source of truth at runtime**:

- **Solution / entity / form structure → the Dataverse Web API metadata.**
- **What a form actually contains (tabs, sections, fields, required levels) → the
  form's `formxml`** returned by the API, and/or the live DOM rendered by the app.
- **Whether a control is required, read-only, hidden, or business-required → the live
  rendered page**, not an assumption about how the field "should" behave.

If something cannot be determined from a concrete reference, the test must **report it
as a skipped/unknown result with the reason** — never silently assume and never invent
expected values. When you (the agent) are unsure of an API shape, **query the API and
inspect the real response** before writing code against it; do not code from memory.

---

## Concrete references to build against (verified Dataverse Web API)

Base URL for an environment: `https://<org>.crm.dynamics.com/api/data/v9.2/`
(the region segment — `.crm4.`, `.crm.dynamics.com`, etc. — must come from config, not
be assumed).

All queries below are OData v4. Send headers:
`OData-MaxVersion: 4.0`, `OData-Version: 4.0`, `Accept: application/json`,
`Prefer: odata.include-annotations="*"`, plus the OAuth `Authorization: Bearer <token>`.

### 1. Resolve the selected solution

```
GET /solutions?$filter=uniquename eq '<SOLUTION_UNIQUE_NAME>'
    &$select=solutionid,uniquename,friendlyname,version
```
Take `solutionid`. Fail loudly if zero or more than one row is returned.

### 2. List the entity (table) components in that solution

```
GET /solutioncomponents
    ?$filter=_solutionid_value eq <solutionid> and componenttype eq 1
    &$select=objectid,componenttype
```
`componenttype eq 1` = **Entity**. `objectid` for an entity component is the entity's
**MetadataId** (not its logical name).

### 3. Resolve each entity MetadataId → logical name (and other metadata)

```
GET /EntityDefinitions(<objectid-guid>)
    ?$select=LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,
             IsCustomizable,DisplayName
```
Use `LogicalName` for form lookups and `EntitySetName` for record CRUD.

> Note: a form (`systemform`) can also be a **direct** component of the solution
> (`componenttype eq 60`). Handle both paths: (a) every Main form of every entity in
> the solution, and (b) any `systemform` added directly to the solution. De-duplicate
> by `formid`.

### 4. List the forms for each entity

```
GET /systemforms
    ?$filter=objecttypecode eq '<LogicalName>' and type eq 2 and formactivationstate eq 1
    &$select=formid,name,type,objecttypecode,formactivationstate,isdefault,formxml
```

`systemform.type` option-set (verified) — make these **named constants**, do not
hard-code bare integers in test logic:

| value | meaning |
|------:|---------|
| 0 | Dashboard |
| 2 | **Main** (primary target) |
| 6 | Quick View |
| 7 | Quick Create |
| 11 | Card |
| 12 | Main – Interactive experience |

`formactivationstate`: `1` = Active, `0` = Inactive. **Only test Active forms** by
default; make this filter configurable.

Which form types to test (Main only, or also Quick Create / Quick View) must be a
**config option**, defaulting to **Main (type 2)**.

### 5. Parse `formxml` to know what's actually on the form

`formxml` is the authoritative layout. Parse it to enumerate, per form:
- tabs (`<tab>` — name, visible, expanded),
- sections (`<section>`),
- and **controls** (`<control>` / `<cell>` with `datafieldname`, `classid`,
  `disabled`, `visible`).

`datafieldname` gives the field's logical name. Cross-reference field requirement
level and type with attribute metadata when needed:

```
GET /EntityDefinitions(LogicalName='<logical>')/Attributes
    ?$select=LogicalName,AttributeType,RequiredLevel,IsValidForCreate,IsValidForUpdate
```

`RequiredLevel.Value` of `ApplicationRequired` / `SystemRequired` ⇒ the field is
required and the form must enforce it.

> **Verify, don't trust formxml alone:** business rules, field-security, and form
> scripts can change required/visible/enabled state at runtime. Treat `formxml` as the
> list of *candidate* fields, then assert against the **live rendered form**.

---

## What the suite must test (generic battery, per discovered form)

For each `(entity, form)` pair, open a **new record** form (and optionally an existing
record — configurable) in the target model-driven app and assert:

1. **Form loads** — navigates to the form without an unhandled error dialog; the form
   selector shows the expected form name; no "form failed to load" banner.
2. **All expected tabs render** — every tab from `formxml` that should be visible is
   present in the DOM.
3. **All expected fields render** — every control with a `datafieldname` that should
   be visible is present and reachable (expand collapsed tabs/sections as needed).
4. **Required-field enforcement** — for fields metadata marks required, attempting to
   **Save** an empty form surfaces the required-field validation (notification / field
   error), and the record is **not** saved. Conversely, filling all required fields
   with type-appropriate generated values allows Save to succeed.
5. **Field type sanity** — each rendered control matches its attribute type
   (e.g. a `DateTime` field exposes a date picker, a `Picklist`/`Boolean` exposes a
   choice control, a `Lookup` exposes a lookup search). Derive expectations from
   attribute metadata, not from the field name.
6. **Read-only / disabled** — controls metadata or formxml marks `disabled` are not
   editable in the UI.
7. **No console / unhandled errors** — capture page `console` errors and failed
   network requests during the form interaction and fail (or warn — configurable) on
   unhandled exceptions.
8. **(Optional, config) Create → verify → delete** a record per form to prove the form
   round-trips. Clean up created test data afterward.

Each assertion result is recorded per `(entity, form, check)` so the report shows
exactly what passed, failed, or was skipped (with reason).

---

## Tech stack & implementation requirements

- **Playwright Test** with **TypeScript**.
- **Authentication:** support both
  (a) **interactive UI login** with Playwright `storageState` reuse, and
  (b) **non-interactive OAuth** (client credentials / service principal) for the
  metadata API calls in CI. Read all credentials and URLs from **environment
  variables / a config file** — never commit secrets. Document required env vars.
- **Dynamic test generation:** discover entities+forms first (a global setup or a
  pre-test discovery script that writes a manifest JSON), then generate one Playwright
  test per `(entity, form)` so they appear individually in the report and can run in
  parallel. Use `test.describe` per entity and a data-driven loop over the manifest.
- **Selectors:** prefer stable model-driven-app selectors — the form control
  `data-id` / `data-control-name` attributes (which equal the field logical name),
  ARIA roles, and the command bar's stable ids — over CSS/text that breaks between
  releases. Centralize selector strategy in a page-object / helper layer.
- **Resilience:** the unified interface UI is async and lazy-renders; use Playwright
  auto-waiting and explicit waits for the form's "ready" state. Handle collapsed tabs,
  the "..." overflow on the command bar, and unsaved-changes dialogs.
- **Idempotent test data:** generate type-correct values from attribute metadata
  (string length limits, option-set first valid value, required lookups → pick/create
  a referenced record). Tag created records (e.g. name prefix) and clean them up.
- **Reporting:** Playwright HTML report + a machine-readable JSON/JUnit summary keyed
  by entity/form/check, suitable for CI artifacts.

## Suggested structure

```
/                       (Playwright project root)
  playwright.config.ts
  package.json
  .env.example          # documents every required variable, no secrets
  src/
    config.ts           # env + run options (solution name, form types, region URL)
    dataverse/
      auth.ts           # OAuth token acquisition
      webapi.ts         # typed Web API client (OData helpers)
      discovery.ts      # solution -> entities -> forms (sections 1-4 above)
      formxml.ts        # parse formxml -> tabs/sections/fields
      metadata.ts       # attribute metadata, required levels, types
    model/
      manifest.ts       # the discovered (entity, form, field) manifest type
    pages/
      modelDrivenApp.ts # page objects: app nav, form load, field accessors, save
    checks/             # one module per check in the battery above
  tests/
    forms.spec.ts       # data-driven: loops the manifest, one test per (entity, form)
  global-setup.ts       # auth + run discovery -> write manifest.json
  artifacts/            # html report, json/junit summary (gitignored)
```

## Configuration the operator provides

- Environment / org base URL (incl. region) and the target **model-driven app** name
  or id (an entity form is opened *within an app*; the app must be configurable).
- **Solution unique name** to test.
- Auth: tenant id, client id, client secret (or interactive login).
- Options: form types to include (default Main), active-only (default true),
  test-existing-records vs new-only, enable create/delete round-trip, parallelism,
  console-error severity.

## Deliverables

1. Working Playwright + TypeScript project per the structure above.
2. The metadata discovery layer with the **exact, verified Web API queries** in the
   "Concrete references" section (cited in code comments).
3. The generic per-form test battery.
4. A `README.md`: prerequisites, env vars, how to select a solution, how to run
   locally and in CI, how to read the report, and a clear statement of which checks
   are **assumption-free (metadata-driven)** vs **best-effort**.
5. `.env.example` and CI workflow example. No secrets committed.

## Acceptance criteria

- Pointed at **any** solution unique name, the suite discovers and tests its entity
  forms with **zero code changes** and no hard-coded entity/form/field names.
- Every "expected" value in an assertion traces back to a concrete reference
  (Web API metadata or live DOM). Anything indeterminate is reported as
  **skipped with a reason**, not assumed.
- Re-running is idempotent and cleans up any test data it creates.

## Before you start — confirm, don't assume

Ask the operator (or read from config) and do not proceed on a guess:
1. Which **environment URL/region** and **model-driven app** to run against.
2. Which **auth mode** (interactive vs service principal) and where credentials live.
3. Whether to test **only Main forms** or also Quick Create / Quick View / Card.
4. Whether the create/delete **round-trip** check is allowed in the target environment
   (it writes data).
5. Run scope: **all** solution entities or an allow/deny list on top of discovery.
