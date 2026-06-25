import type { WebApiClient } from './webapi.js';
import type { AttributeMeta, RequiredLevel } from '../model/manifest.js';

/** Raw shape of an attribute row from EntityDefinitions(...)/Attributes. */
interface RawAttribute {
  LogicalName: string;
  AttributeType?: string;
  RequiredLevel?: { Value?: string };
  IsValidForCreate?: boolean;
  IsValidForUpdate?: boolean;
  DisplayName?: { UserLocalizedLabel?: { Label?: string } | null };
}

const REQUIRED_LEVELS: ReadonlySet<string> = new Set([
  'None',
  'SystemRequired',
  'ApplicationRequired',
  'Recommended',
]);

function normalizeRequiredLevel(value: string | undefined): RequiredLevel {
  if (value && REQUIRED_LEVELS.has(value)) return value as RequiredLevel;
  return 'None';
}

/**
 * Fetch attribute metadata for an entity, keyed by logical name.
 *
 * Verified reference (query metadata with the Web API):
 *   GET EntityDefinitions(LogicalName='x')/Attributes?$select=LogicalName,AttributeType,RequiredLevel,IsValidForCreate,IsValidForUpdate,DisplayName
 * https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api
 */
export async function fetchEntityAttributes(
  client: WebApiClient,
  entityLogicalName: string,
): Promise<Record<string, AttributeMeta>> {
  const select = [
    'LogicalName',
    'AttributeType',
    'RequiredLevel',
    'IsValidForCreate',
    'IsValidForUpdate',
    'DisplayName',
  ].join(',');

  const rows = await client.list<RawAttribute>(
    `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=${select}`,
  );

  const result: Record<string, AttributeMeta> = {};
  for (const row of rows) {
    if (!row.LogicalName) continue;
    result[row.LogicalName] = {
      logicalName: row.LogicalName,
      attributeType: row.AttributeType ?? 'Unknown',
      requiredLevel: normalizeRequiredLevel(row.RequiredLevel?.Value),
      isValidForCreate: row.IsValidForCreate ?? false,
      isValidForUpdate: row.IsValidForUpdate ?? false,
      displayName: row.DisplayName?.UserLocalizedLabel?.Label ?? undefined,
    };
  }
  return result;
}

/** A field is required (must be enforced by the form) when its level is System/Application required. */
export function isRequired(meta: AttributeMeta | undefined): boolean {
  return meta?.requiredLevel === 'SystemRequired' || meta?.requiredLevel === 'ApplicationRequired';
}
