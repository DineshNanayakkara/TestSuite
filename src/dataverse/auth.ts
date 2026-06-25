import type { AppConfig } from '../config.js';

/**
 * Acquire a Dataverse Web API access token via the OAuth 2.0 client-credentials
 * flow (Microsoft Entra ID service principal).
 *
 * Verified references:
 *  - Token endpoint: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
 *  - grant_type=client_credentials, scope={environmentUrl}/.default
 *  https://learn.microsoft.com/en-us/power-apps/developer/data-platform/authenticate-oauth
 */
export async function getAccessToken(cfg: AppConfig): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: `${cfg.dataverseUrl}/.default`,
    grant_type: 'client_credentials',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `OAuth token request failed (${res.status}). ` +
        `Check AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET and that an ` +
        `Application User exists in Dataverse. Response: ${text}`,
    );
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('OAuth token response did not include an access_token.');
  }
  return json.access_token;
}
