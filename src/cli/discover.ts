import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { getAccessToken } from '../dataverse/auth.js';
import { discover } from '../dataverse/discovery.js';

/**
 * Standalone discovery step. Run BEFORE `playwright test` (see package.json
 * "test:full"). Playwright 1.19+ runs globalSetup AFTER collecting test files,
 * so the manifest must already exist on disk when the spec is loaded.
 */
async function main(): Promise<void> {
  const cfg = loadConfig();
  const generatedAt = new Date().toISOString();

  console.log(`[discover] Authenticating to ${cfg.dataverseUrl} ...`);
  const token = await getAccessToken(cfg);

  console.log(`[discover] Discovering solution '${cfg.solutionUniqueName}' ...`);
  const manifest = await discover(cfg, token, generatedAt);

  const outPath = resolve(process.cwd(), cfg.manifestPath);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(manifest, null, 2), 'utf8');

  const totalForms = manifest.entities.reduce((n, e) => n + e.forms.length, 0);
  console.log(
    `[discover] Wrote ${outPath}\n` +
      `[discover] Solution: ${manifest.solution.friendlyName} (v${manifest.solution.version})\n` +
      `[discover] Entities: ${manifest.entities.length}, Forms: ${totalForms}, ` +
      `Form types: [${manifest.options.formTypes.join(', ')}], activeOnly=${manifest.options.activeOnly}`,
  );

  if (totalForms === 0) {
    console.warn(
      '[discover] WARNING: 0 forms discovered. Check the solution unique name, the ' +
        'FORM_TYPES filter, and that the solution actually contains entity forms.',
    );
  }
}

main().catch((err: unknown) => {
  console.error('[discover] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
