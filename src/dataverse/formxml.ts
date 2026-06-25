import { XMLParser } from 'fast-xml-parser';
import type { FormFieldRef, FormTab } from '../model/manifest.js';

/**
 * Pure parser for Dataverse form XML. No network, no config — so it is fully
 * unit-testable (see tests/formxml.unit.spec.ts).
 *
 * Form XML shape (Main form), simplified:
 *   form > tabs > tab[name,visible,expanded] > columns > column > sections >
 *     section[visible] > rows > row > cell[visible] > control[datafieldname,classid,disabled,visible]
 * Header and footer also contain rows/cells/controls. We collect every control
 * that carries a `datafieldname` (subgrids, spacers, web resources have none).
 *
 * `formxml` is treated as the list of CANDIDATE fields/tabs. Runtime state
 * (business rules, field security, scripts) can still differ — callers assert
 * against the live DOM, not against this alone.
 */
export interface ParsedForm {
  tabs: FormTab[];
  fields: FormFieldRef[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  trimValues: true,
});

type AnyNode = Record<string, unknown>;

function toArray<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function attr(node: AnyNode | undefined, name: string): string | undefined {
  if (!node) return undefined;
  const v = node[`@_${name}`];
  return v === undefined || v === null ? undefined : String(v);
}

function boolAttr(node: AnyNode | undefined, name: string, dflt: boolean): boolean {
  const v = attr(node, name);
  if (v === undefined) return dflt;
  const s = v.toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return dflt;
}

function firstLabel(node: AnyNode | undefined): string | undefined {
  const labels = (node?.['labels'] as AnyNode | undefined)?.['label'];
  const first = toArray(labels as AnyNode | AnyNode[] | undefined)[0];
  return attr(first, 'description');
}

/** Collect field controls under a node that holds rows (a section, header, or footer). */
function collectControlsFromRows(
  container: AnyNode | undefined,
  parentVisible: boolean,
  out: Map<string, FormFieldRef>,
): void {
  if (!container) return;
  const rows = toArray((container['rows'] as AnyNode | undefined)?.['row'] as AnyNode | AnyNode[]);
  for (const row of rows) {
    const cells = toArray((row as AnyNode)['cell'] as AnyNode | AnyNode[]);
    for (const cell of cells) {
      const cellVisible = parentVisible && boolAttr(cell, 'visible', true);
      const controls = toArray((cell as AnyNode)['control'] as AnyNode | AnyNode[]);
      for (const control of controls) {
        const datafield = attr(control, 'datafieldname');
        if (!datafield) continue; // subgrids / spacers / web resources have no field
        const field: FormFieldRef = {
          logicalName: datafield,
          disabled: boolAttr(control, 'disabled', false),
          visible: cellVisible && boolAttr(control, 'visible', true),
          classId: attr(control, 'classid'),
        };
        // De-duplicate by logical name; prefer a visible+enabled occurrence.
        const existing = out.get(datafield);
        if (!existing || (!existing.visible && field.visible) || (existing.disabled && !field.disabled)) {
          out.set(datafield, field);
        }
      }
    }
  }
}

export function parseFormXml(formXml: string | null | undefined): ParsedForm {
  const tabs: FormTab[] = [];
  const fields = new Map<string, FormFieldRef>();

  if (!formXml || formXml.trim() === '') {
    return { tabs, fields: [] };
  }

  const root = parser.parse(formXml) as AnyNode;
  const form = (root['form'] ?? root) as AnyNode;

  // Header and footer fields (not inside a tab).
  collectControlsFromRows(form['header'] as AnyNode, true, fields);
  collectControlsFromRows(form['footer'] as AnyNode, true, fields);

  const tabNodes = toArray((form['tabs'] as AnyNode | undefined)?.['tab'] as AnyNode | AnyNode[]);
  for (const tab of tabNodes) {
    const tabVisible = boolAttr(tab, 'visible', true);
    tabs.push({
      name: attr(tab, 'name') ?? '',
      label: firstLabel(tab),
      visible: tabVisible,
      expanded: boolAttr(tab, 'expanded', true),
    });

    const columns = toArray((tab['columns'] as AnyNode | undefined)?.['column'] as AnyNode | AnyNode[]);
    for (const column of columns) {
      const sections = toArray(
        ((column as AnyNode)['sections'] as AnyNode | undefined)?.['section'] as AnyNode | AnyNode[],
      );
      for (const section of sections) {
        const sectionVisible = tabVisible && boolAttr(section, 'visible', true);
        collectControlsFromRows(section as AnyNode, sectionVisible, fields);
      }
    }
  }

  return { tabs, fields: [...fields.values()] };
}
