import { test, expect } from '@playwright/test';
import { parseFormXml } from '../src/dataverse/formxml.js';

/**
 * Pure unit tests for the form-xml parser. No browser, no org — these run
 * anywhere and guard the most logic-heavy, assumption-prone piece of discovery.
 * The sample below mirrors real Dataverse Main-form XML structure.
 */
const SAMPLE_FORM_XML = `
<form>
  <header id="hdr">
    <rows>
      <row>
        <cell id="c-owner">
          <control id="ownerid" classid="{270BD3DB-D9AF-4782-9025-509E298DEC0A}" datafieldname="ownerid" disabled="false" />
        </cell>
      </row>
    </rows>
  </header>
  <tabs>
    <tab name="general" expanded="true" visible="true">
      <labels><label description="General" languagecode="1033" /></labels>
      <columns>
        <column width="100%">
          <sections>
            <section name="sec_main" visible="true">
              <rows>
                <row>
                  <cell id="c-name">
                    <control id="name" classid="{4273EDBD-AC1D-40d3-9FB2-095C621B552D}" datafieldname="name" disabled="false" />
                  </cell>
                  <cell id="c-spacer"><!-- spacer, no control --></cell>
                </row>
                <row>
                  <cell id="c-number">
                    <control id="accountnumber" datafieldname="accountnumber" disabled="true" />
                  </cell>
                  <cell id="c-grid">
                    <control id="grid1" classid="{E7A81278-8635-4d9e-8D4D-59480B391C5B}" />
                  </cell>
                </row>
              </rows>
            </section>
            <section name="sec_hidden" visible="false">
              <rows>
                <row>
                  <cell id="c-hiddenfield">
                    <control id="description" datafieldname="description" />
                  </cell>
                </row>
              </rows>
            </section>
          </sections>
        </column>
      </columns>
    </tab>
    <tab name="hiddenTab" visible="false">
      <columns><column><sections><section visible="true"><rows><row>
        <cell><control id="telephone1" datafieldname="telephone1" /></cell>
      </row></rows></section></sections></column></columns>
    </tab>
  </tabs>
</form>
`;

test.describe('parseFormXml', () => {
  const parsed = parseFormXml(SAMPLE_FORM_XML);
  const byName = new Map(parsed.fields.map((f) => [f.logicalName, f]));

  test('extracts tabs with visibility and expanded state', () => {
    expect(parsed.tabs.map((t) => t.name)).toEqual(['general', 'hiddenTab']);
    expect(parsed.tabs.find((t) => t.name === 'general')).toMatchObject({
      visible: true,
      expanded: true,
      label: 'General',
    });
    expect(parsed.tabs.find((t) => t.name === 'hiddenTab')?.visible).toBe(false);
  });

  test('collects only controls that carry a datafieldname', () => {
    // grid1 has no datafieldname and the spacer has no control -> excluded.
    expect(byName.has('name')).toBe(true);
    expect(byName.has('accountnumber')).toBe(true);
    expect([...byName.keys()]).not.toContain('grid1');
  });

  test('captures header fields', () => {
    expect(byName.get('ownerid')).toMatchObject({ logicalName: 'ownerid', visible: true });
  });

  test('honors disabled attribute (default false)', () => {
    expect(byName.get('name')?.disabled).toBe(false);
    expect(byName.get('accountnumber')?.disabled).toBe(true);
  });

  test('propagates section and tab visibility to fields', () => {
    // description is in a hidden section -> not visible.
    expect(byName.get('description')?.visible).toBe(false);
    // telephone1 is in a visible section but inside a hidden tab -> not visible.
    expect(byName.get('telephone1')?.visible).toBe(false);
    // name is in a visible section/tab -> visible.
    expect(byName.get('name')?.visible).toBe(true);
  });

  test('returns empty result for empty/blank xml', () => {
    expect(parseFormXml('')).toEqual({ tabs: [], fields: [] });
    expect(parseFormXml(undefined)).toEqual({ tabs: [], fields: [] });
  });
});
