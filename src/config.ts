import 'dotenv/config';

/**
 * Typed, validated runtime configuration. Every value comes from the environment
 * (or a documented default) — nothing about a specific org/solution/entity is
 * baked into the code. Importing this module validates the env eagerly so a
 * misconfiguration fails fast with a clear message.
 */
export type UiAuthMode = 'storageState' | 'credentials';

export interface AppConfig {
  /** e.g. https://org.crm.dynamics.com (no trailing slash) */
  dataverseUrl: string;
  /** e.g. https://org.crm.dynamics.com/api/data/v9.2 */
  apiBase: string;
  apiVersion: string;
  appId: string | undefined;

  solutionUniqueName: string;

  // Metadata API auth (service principal, client credentials)
  tenantId: string;
  clientId: string;
  clientSecret: string;

  // UI auth
  uiAuthMode: UiAuthMode;
  storageStatePath: string;
  username: string | undefined;
  password: string | undefined;

  // What to test
  formTypes: number[];
  activeOnly: boolean;
  entityAllow: string[];
  entityDeny: string[];
  enableCrudRoundtrip: boolean;
  consoleErrorFatal: boolean;

  manifestPath: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v.trim() === '' ? fallback : v.trim();
}

function optionalOrUndefined(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v.trim() === '' ? undefined : v.trim();
}

function asBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function asList(name: string): string[] {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function asNumberList(name: string, fallback: number[]): number[] {
  const items = asList(name);
  if (items.length === 0) return fallback;
  const nums = items.map((s) => Number(s));
  const bad = nums.filter((n) => !Number.isFinite(n));
  if (bad.length > 0) {
    throw new Error(`Environment variable ${name} must be a comma-separated list of integers.`);
  }
  return nums;
}

/**
 * Build config. `forUi` toggles which auth secrets are mandatory:
 *  - discovery (CLI) needs the service-principal secrets,
 *  - UI tests need a storage state path (or credentials).
 * Both share the rest. We validate lazily-but-eagerly here.
 */
export function loadConfig(): AppConfig {
  const dataverseUrl = required('DATAVERSE_URL').replace(/\/+$/, '');
  const apiVersion = optional('DATAVERSE_API_VERSION', 'v9.2');
  const uiAuthMode = optional('UI_AUTH_MODE', 'storageState') as UiAuthMode;

  if (uiAuthMode !== 'storageState' && uiAuthMode !== 'credentials') {
    throw new Error(`UI_AUTH_MODE must be "storageState" or "credentials", got "${uiAuthMode}".`);
  }

  return {
    dataverseUrl,
    apiBase: `${dataverseUrl}/api/data/${apiVersion}`,
    apiVersion,
    appId: optionalOrUndefined('DATAVERSE_APP_ID'),

    solutionUniqueName: required('SOLUTION_UNIQUE_NAME'),

    tenantId: required('AZURE_TENANT_ID'),
    clientId: required('AZURE_CLIENT_ID'),
    clientSecret: required('AZURE_CLIENT_SECRET'),

    uiAuthMode,
    storageStatePath: optional('UI_STORAGE_STATE', '.auth/user.json'),
    username: optionalOrUndefined('DATAVERSE_USERNAME'),
    password: optionalOrUndefined('DATAVERSE_PASSWORD'),

    formTypes: asNumberList('FORM_TYPES', [2]),
    activeOnly: asBool('ACTIVE_ONLY', true),
    entityAllow: asList('ENTITY_ALLOW'),
    entityDeny: asList('ENTITY_DENY'),
    enableCrudRoundtrip: asBool('ENABLE_CRUD_ROUNDTRIP', false),
    consoleErrorFatal: asBool('CONSOLE_ERROR_FATAL', false),

    manifestPath: optional('MANIFEST_PATH', 'artifacts/manifest.json'),
  };
}
