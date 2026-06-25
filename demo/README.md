# Demo

A self-contained illustration of how the form battery behaves — recorded as a
short video against a **mock** Unified Interface form. It is **not** a recording
of a live Dynamics 365 org; it exists so you can see the checks and logic without
needing environment access.

- `mock-form.html` — a static page that mimics a model-driven "New Account" form,
  using the same DOM conventions the suite relies on: `data-id="account.<field>.fieldControl-…"`,
  `aria-required`, `role="tab"`, and Ctrl+S to save (blocked when a required field
  is empty).
- `record-demo.ts` — drives the mock with the suite's **real** `src/pages/selectors.ts`
  locators and records a video showing Checks 1–4 plus the save round-trip.

## Run

```bash
npm run demo
# -> writes demo/output/d365-suite-demo.webm
```

If your Playwright browser build differs from the pinned version, point the demo
at an installed Chromium:

```bash
DEMO_CHROME_PATH=/path/to/chrome npm run demo
```

The output video (`demo/output/`) is gitignored — regenerate it any time.

## What it shows vs. a real run

| Demo (mock) | Real run |
|---|---|
| Fields/tabs hard-coded into a static page | Discovered from the solution's metadata + `formxml` |
| One mock "account" form | Every form on every entity in the selected solution |
| Same `selectors.ts`, same check logic | Same `selectors.ts`, same check logic |

To produce a real recording, configure `.env` for your org (see the root README)
and run `npm run test:full` — Playwright captures video/trace on failures, and
`npm run report` opens the HTML report.
