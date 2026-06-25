/**
 * Minimal typed Dataverse Web API (OData v4) client.
 *
 * Required headers per Microsoft guidance:
 *   OData-MaxVersion: 4.0, OData-Version: 4.0, Accept: application/json
 * https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/perform-operations-web-api
 */
export interface ODataCollection<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

export class WebApiClient {
  constructor(
    private readonly apiBase: string,
    private readonly token: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"',
    };
  }

  private url(pathOrUrl: string): string {
    return pathOrUrl.startsWith('http') ? pathOrUrl : `${this.apiBase}/${pathOrUrl}`;
  }

  /** GET a single resource (entity by key, or a navigation that returns one object). */
  async get<T>(pathOrUrl: string): Promise<T> {
    const url = this.url(pathOrUrl);
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`Web API GET ${url} failed (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  /** GET a collection, transparently following @odata.nextLink paging. */
  async list<T>(pathOrUrl: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = this.url(pathOrUrl);
    while (next) {
      const res = await fetch(next, { headers: this.headers() });
      if (!res.ok) {
        throw new Error(`Web API GET ${next} failed (${res.status}): ${await res.text()}`);
      }
      const page = (await res.json()) as ODataCollection<T>;
      out.push(...page.value);
      next = page['@odata.nextLink'];
    }
    return out;
  }
}
