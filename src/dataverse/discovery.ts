import type { AppConfig } from '../config.js';
import { WebApiClient } from './webapi.js';
import { parseFormXml } from './formxml.js';
import { fetchEntityAttributes } from './metadata.js';
import {
  FORM_ACTIVATION_STATE,
  FORM_TYPE_NAME,
  type EntityManifest,
  type FormManifest,
  type Manifest,
  type SolutionInfo,
} from '../model/manifest.js';

/**
 * Discover everything the suite tests, straight from Dataverse metadata.
 * The query chain (all verified against Microsoft Learn references):
 *
 *  1. solutions?$filter=uniquename eq '...'                      -> solutionid
 *  2. solutioncomponents (componenttype=1 Entity)                -> entity MetadataIds
 *     solutioncomponents (componenttype=60 Form)                 -> directly-added forms
 *  3. EntityDefinitions(<MetadataId>)                            -> LogicalName, EntitySetName, ...
 *  4. systemforms?$filter=objecttypecode eq '...' and type ...   -> forms + formxml
 *  5. EntityDefinitions(LogicalName='...')/Attributes            -> required levels & types
 */

const COMPONENT_TYPE_ENTITY = 1;
const COMPONENT_TYPE_FORM = 60;

interface SolutionRow {
  solutionid: string;
  uniquename: string;
  friendlyname: string;
  version: string;
}

interface SolutionComponentRow {
  objectid: string;
  componenttype: number;
}

interface EntityDefinitionRow {
  MetadataId: string;
  LogicalName: string;
  EntitySetName: string;
  PrimaryIdAttribute: string;
  PrimaryNameAttribute: string;
  DisplayName?: { UserLocalizedLabel?: { Label?: string } | null };
}

interface SystemFormRow {
  formid: string;
  name: string;
  type: number;
  objecttypecode: string;
  formactivationstate: number;
  isdefault: boolean;
  formxml: string;
}

async function resolveSolution(client: WebApiClient, uniqueName: string): Promise<SolutionInfo> {
  const rows = await client.list<SolutionRow>(
    `solutions?$select=solutionid,uniquename,friendlyname,version&$filter=uniquename eq '${uniqueName}'`,
  );
  if (rows.length === 0) {
    throw new Error(
      `No solution found with unique name '${uniqueName}'. Use the solution's "Name" (unique name), not its display name.`,
    );
  }
  if (rows.length > 1) {
    throw new Error(`Expected exactly one solution named '${uniqueName}', found ${rows.length}.`);
  }
  const s = rows[0]!;
  return {
    uniqueName: s.uniquename,
    solutionId: s.solutionid,
    friendlyName: s.friendlyname,
    version: s.version,
  };
}

async function componentObjectIds(
  client: WebApiClient,
  solutionId: string,
  componentType: number,
): Promise<string[]> {
  const rows = await client.list<SolutionComponentRow>(
    `solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solutionId} and componenttype eq ${componentType}`,
  );
  return rows.map((r) => r.objectid);
}

async function resolveEntity(
  client: WebApiClient,
  metadataId: string,
): Promise<EntityDefinitionRow | undefined> {
  const select = 'MetadataId,LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,DisplayName';
  try {
    return await client.get<EntityDefinitionRow>(`EntityDefinitions(${metadataId})?$select=${select}`);
  } catch {
    // A solution entity component may be something EntityDefinitions can't resolve
    // (e.g. an elastic/virtual edge case). Skip it rather than assume.
    return undefined;
  }
}

function buildFormFilter(logicalName: string, formTypes: number[], activeOnly: boolean): string {
  const typeClause = formTypes.map((t) => `type eq ${t}`).join(' or ');
  let filter = `objecttypecode eq '${logicalName}' and (${typeClause})`;
  if (activeOnly) {
    filter += ` and formactivationstate eq ${FORM_ACTIVATION_STATE.Active}`;
  }
  return filter;
}

async function fetchForms(
  client: WebApiClient,
  logicalName: string,
  cfg: AppConfig,
): Promise<FormManifest[]> {
  const select = 'formid,name,type,objecttypecode,formactivationstate,isdefault,formxml';
  const filter = buildFormFilter(logicalName, cfg.formTypes, cfg.activeOnly);
  const rows = await client.list<SystemFormRow>(
    `systemforms?$select=${select}&$filter=${encodeURIComponent(filter)}`,
  );

  return rows.map((row) => {
    const parsed = parseFormXml(row.formxml);
    return {
      formId: row.formid,
      name: row.name,
      type: row.type,
      typeName: FORM_TYPE_NAME[row.type] ?? `Type${row.type}`,
      isDefault: row.isdefault,
      tabs: parsed.tabs,
      fields: parsed.fields,
    } satisfies FormManifest;
  });
}

function entityIncluded(logicalName: string, cfg: AppConfig): boolean {
  if (cfg.entityDeny.includes(logicalName)) return false;
  if (cfg.entityAllow.length > 0 && !cfg.entityAllow.includes(logicalName)) return false;
  return true;
}

export async function discover(cfg: AppConfig, token: string, generatedAt: string): Promise<Manifest> {
  const client = new WebApiClient(cfg.apiBase, token);

  const solution = await resolveSolution(client, cfg.solutionUniqueName);

  const entityMetadataIds = await componentObjectIds(client, solution.solutionId, COMPONENT_TYPE_ENTITY);
  const directFormIds = await componentObjectIds(client, solution.solutionId, COMPONENT_TYPE_FORM);

  // Resolve entities, keyed by logical name (so direct forms can attach to them).
  const entities = new Map<string, EntityManifest>();
  for (const metadataId of entityMetadataIds) {
    const def = await resolveEntity(client, metadataId);
    if (!def || !entityIncluded(def.LogicalName, cfg)) continue;

    const [forms, attributes] = await Promise.all([
      fetchForms(client, def.LogicalName, cfg),
      fetchEntityAttributes(client, def.LogicalName),
    ]);

    entities.set(def.LogicalName, {
      metadataId: def.MetadataId,
      logicalName: def.LogicalName,
      entitySetName: def.EntitySetName,
      displayName: def.DisplayName?.UserLocalizedLabel?.Label ?? undefined,
      primaryIdAttribute: def.PrimaryIdAttribute,
      primaryNameAttribute: def.PrimaryNameAttribute,
      attributes,
      forms,
    });
  }

  // Forms added directly to the solution (componenttype 60) whose entity is not
  // already covered above. Fetch each form, then ensure its entity is present.
  if (directFormIds.length > 0) {
    const knownFormIds = new Set(
      [...entities.values()].flatMap((e) => e.forms.map((f) => f.formId)),
    );
    for (const formId of directFormIds) {
      if (knownFormIds.has(formId)) continue;
      let row: SystemFormRow;
      try {
        row = await client.get<SystemFormRow>(
          `systemforms(${formId})?$select=formid,name,type,objecttypecode,formactivationstate,isdefault,formxml`,
        );
      } catch {
        continue;
      }
      if (!cfg.formTypes.includes(row.type)) continue;
      if (cfg.activeOnly && row.formactivationstate !== FORM_ACTIVATION_STATE.Active) continue;
      const logicalName = row.objecttypecode;
      if (!entityIncluded(logicalName, cfg)) continue;

      let entity = entities.get(logicalName);
      if (!entity) {
        // Discover the entity definition for this directly-added form.
        const def = await client.list<EntityDefinitionRow>(
          `EntityDefinitions?$select=MetadataId,LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,DisplayName&$filter=LogicalName eq '${logicalName}'`,
        );
        const d = def[0];
        if (!d) continue;
        entity = {
          metadataId: d.MetadataId,
          logicalName: d.LogicalName,
          entitySetName: d.EntitySetName,
          displayName: d.DisplayName?.UserLocalizedLabel?.Label ?? undefined,
          primaryIdAttribute: d.PrimaryIdAttribute,
          primaryNameAttribute: d.PrimaryNameAttribute,
          attributes: await fetchEntityAttributes(client, d.LogicalName),
          forms: [],
        };
        entities.set(logicalName, entity);
      }
      const parsed = parseFormXml(row.formxml);
      entity.forms.push({
        formId: row.formid,
        name: row.name,
        type: row.type,
        typeName: FORM_TYPE_NAME[row.type] ?? `Type${row.type}`,
        isDefault: row.isdefault,
        tabs: parsed.tabs,
        fields: parsed.fields,
      });
    }
  }

  return {
    generatedAt,
    dataverseUrl: cfg.dataverseUrl,
    solution,
    options: { formTypes: cfg.formTypes, activeOnly: cfg.activeOnly },
    entities: [...entities.values()].sort((a, b) => a.logicalName.localeCompare(b.logicalName)),
  };
}
