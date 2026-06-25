/**
 * The discovery manifest: the single source of truth the tests consume.
 * It is produced by `npm run discover` (src/cli/discover.ts) entirely from
 * Dataverse Web API metadata — no entity/form/field is hard-coded.
 */

/**
 * systemform.type option-set values (verified against the Microsoft Dataverse
 * SystemForm table reference). Kept as named constants so test logic never
 * compares bare integers.
 * https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/systemform
 */
export const FORM_TYPE = {
  Dashboard: 0,
  AppointmentBook: 1,
  Main: 2,
  MiniCampaignBO: 3,
  Preview: 4,
  MobileExpress: 5,
  QuickView: 6,
  QuickCreate: 7,
  Dialog: 8,
  TaskFlowForm: 9,
  InteractionCentricDashboard: 10,
  Card: 11,
  MainInteractive: 12,
  ContextualDashboard: 13,
} as const;

export const FORM_TYPE_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(FORM_TYPE).map(([name, value]) => [value, name]),
);

/** systemform.formactivationstate */
export const FORM_ACTIVATION_STATE = { Inactive: 0, Active: 1 } as const;

export type RequiredLevel = 'None' | 'SystemRequired' | 'ApplicationRequired' | 'Recommended';

export interface AttributeMeta {
  logicalName: string;
  /** AttributeMetadata.AttributeType, e.g. "String", "DateTime", "Picklist", "Lookup", "Boolean", "Money". */
  attributeType: string;
  requiredLevel: RequiredLevel;
  isValidForCreate: boolean;
  isValidForUpdate: boolean;
  displayName?: string;
}

export interface FormFieldRef {
  /** datafieldname from the form's <control>. */
  logicalName: string;
  /** Form-level disabled flag from formxml (runtime state may still differ). */
  disabled: boolean;
  /** Form-level visible flag from formxml (control/section/tab). */
  visible: boolean;
  classId?: string;
}

export interface FormTab {
  name: string;
  label?: string;
  visible: boolean;
  expanded: boolean;
}

export interface FormManifest {
  formId: string;
  name: string;
  type: number;
  typeName: string;
  isDefault: boolean;
  tabs: FormTab[];
  fields: FormFieldRef[];
}

export interface EntityManifest {
  metadataId: string;
  logicalName: string;
  entitySetName: string;
  displayName?: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
  /** Keyed by attribute logical name. */
  attributes: Record<string, AttributeMeta>;
  forms: FormManifest[];
}

export interface SolutionInfo {
  uniqueName: string;
  solutionId: string;
  friendlyName: string;
  version: string;
}

export interface Manifest {
  generatedAt: string;
  dataverseUrl: string;
  solution: SolutionInfo;
  options: {
    formTypes: number[];
    activeOnly: boolean;
  };
  entities: EntityManifest[];
}
