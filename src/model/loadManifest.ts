import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Manifest } from './manifest.js';

/**
 * Read the discovery manifest synchronously at test-collection time.
 * Returns null if it does not exist yet (so specs can degrade to a single
 * skipped test instead of crashing the whole run — Playwright 1.19+ collects
 * test files BEFORE globalSetup, so the manifest must be produced earlier by
 * `npm run discover`).
 */
export function loadManifestSync(manifestPath = process.env.MANIFEST_PATH || 'artifacts/manifest.json'): Manifest | null {
  const abs = resolve(process.cwd(), manifestPath);
  if (!existsSync(abs)) return null;
  const raw = readFileSync(abs, 'utf8');
  return JSON.parse(raw) as Manifest;
}
