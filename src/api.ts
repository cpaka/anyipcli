// ─── anyIP.io REST API Client (Public API v1) ─────────────────────────────────
// All v1 endpoints are team-scoped: /api/v1/teams/{team_id}/…
// The team id comes from GET /api/users/me (default_team.id) and is cached
// per API key in the local config.

import { config } from "./config.js";

export const BASE_URL = "https://dashboard.anyip.io";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProxyAccount {
  id: string;
  description: string | null;
  enabled: boolean;
  status?: string | null;         // e.g. "ACTIVE", "ACCOUNT_BLOCKED"
  is_active?: boolean | null;
  username?: string | null;
  password?: string | null;
  quota_bytes?: number | null;    // 0 = unlimited (team quota applies)
  consumption_bytes?: number | null;
  last_activity_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CreateProxyPayload {
  description?: string;
  enabled?: boolean;
  password?: string;
  quota_bytes?: number;
}

export interface ProfileLocation {
  country_code?: string | null;
  region?: string | null;
  city?: string | null;
  asn?: number | null;
}

export interface ProfileSession {
  type?: "sticky" | "rotating" | null;
  duration?: number | null;       // minutes
}

export interface ProxyProfile {
  id?: string;
  name: string;
  notes?: string | null;
  proxy_type?: "residential" | "mobile" | null;
  auth_method?: "usernamePassword" | "ipWhitelist" | null;
  proxy_protocol?: string | null; // "http" | "socks5"
  port?: number | null;
  location?: ProfileLocation | null;
  session?: ProfileSession | null;
  advanced_settings?: Record<string, unknown> | null;
  proxy_account_id: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface User {
  id: string;
  email: string;
  default_team?: { id: string; name?: string };
}

export interface Usage {
  quota_bytes: number;
  consumption_bytes: number;
  remaining_bytes: number;
  proxy_account_quota: number;
  proxy_accounts_used: number;
  period?: { from?: string | null; to?: string | null } | null;
}

export interface Subscription {
  plan?: { name?: string | null; quota_bytes?: number | null; proxy_account_quota?: number | null } | null;
  status?: string | null;
  billing_cycle?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  next_payment_at?: string | null;
}

export interface TrafficPoint {
  timestamp: string;
  bytes_sent: number;
  bytes_recv: number;
}

export interface Country {
  name: string;
  value: string;  // ISO code, e.g. "US"
}

export interface Region {
  name: string;
  value: string;  // lowercase slug, e.g. "california"
}

export interface City {
  name: string;
  value: string;  // lowercase slug, e.g. "losangeles"
}

export interface AsnEntry {
  name: string;
  value: number;  // ASN number
}

interface Collection<T> {
  data: T[];
  meta: { page: number; per_page: number; total: number };
}

export class AnyIPError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "AnyIPError";
  }
}

// ── Request helper ─────────────────────────────────────────────────────────────

type Params = Record<string, string | string[]>;

async function request<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
  params?: Params
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
      else url.searchParams.set(k, v);
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      signal: controller.signal,
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let parsed: unknown;
    try {
      const text = await res.text();
      try {
        parsed = JSON.parse(text);
        const err = parsed as {
          detail?: string;
          title?: string;
          message?: string;
          "hydra:description"?: string;
          violations?: Array<{ propertyPath?: string; message?: string }>;
        };
        if (err.violations?.length) {
          msg = err.violations
            .map((v) => (v.propertyPath ? `${v.propertyPath}: ${v.message}` : v.message))
            .filter(Boolean)
            .join("; ");
        } else {
          msg = err.detail ?? err["hydra:description"] ?? err.title ?? err.message ?? (text || msg);
        }
      } catch {
        if (text) msg = text;
      }
    } catch {}
    throw new AnyIPError(res.status, msg, parsed);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Team resolution ────────────────────────────────────────────────────────────
// v1 endpoints need a team id. We read it from /api/users/me (default_team.id)
// and cache it in the local config, keyed by API key so a key change refreshes it.

let teamIdMemo: string | undefined;

export async function getTeamId(apiKey: string): Promise<string> {
  if (teamIdMemo) return teamIdMemo;

  const cachedKey = config.get("teamIdForKey");
  const cachedTeam = config.get("teamId");
  if (cachedTeam && cachedKey === apiKey) {
    teamIdMemo = cachedTeam;
    return cachedTeam;
  }

  const me = await getMe(apiKey);
  const teamId = me.default_team?.id;
  if (!teamId) {
    throw new AnyIPError(500, "Could not resolve team id from /api/users/me — is your API key valid?");
  }
  config.set("teamId", teamId);
  config.set("teamIdForKey", apiKey);
  teamIdMemo = teamId;
  return teamId;
}

async function teamPath(apiKey: string, suffix: string): Promise<string> {
  const teamId = await getTeamId(apiKey);
  return `/api/v1/teams/${teamId}${suffix}`;
}

// ── User ───────────────────────────────────────────────────────────────────────

export async function getMe(apiKey: string): Promise<User> {
  return request<User>(apiKey, "GET", "/api/users/me");
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
}

export async function login(
  apiKey: string,
  email: string,
  password: string
): Promise<LoginResponse> {
  return request<LoginResponse>(apiKey, "POST", "/api/login", { email, password });
}

// ── Data endpoints (legacy, not yet in v1) ─────────────────────────────────────
// Responses are plain JSON arrays.

export async function getCountries(apiKey: string): Promise<Country[]> {
  return request<Country[]>(apiKey, "GET", "/api/data/country");
}

export async function getRegions(apiKey: string, country: string): Promise<Region[]> {
  return request<Region[]>(apiKey, "GET", `/api/data/region/${country}`);
}

// The API requires both a country code and a region slug.
export async function getCities(
  apiKey: string,
  country: string,
  region: string
): Promise<City[]> {
  return request<City[]>(apiKey, "GET", `/api/data/city/${country}/${region}`);
}

export async function getAsn(apiKey: string, country: string): Promise<AsnEntry[]> {
  return request<AsnEntry[]>(apiKey, "GET", `/api/data/asn/${country}`);
}

// ── ProxyAccount ───────────────────────────────────────────────────────────────

export async function listProxies(
  apiKey: string,
  params?: { page?: string; itemsPerPage?: string; search?: string; status?: string; is_active?: string }
): Promise<{ members: ProxyAccount[]; total: number }> {
  const data = await request<Collection<ProxyAccount>>(
    apiKey, "GET", await teamPath(apiKey, "/proxy_accounts"), undefined,
    params as Params
  );
  return { members: data.data ?? [], total: data.meta?.total ?? 0 };
}

export async function getProxy(apiKey: string, id: string): Promise<ProxyAccount> {
  return request<ProxyAccount>(apiKey, "GET", await teamPath(apiKey, `/proxy_accounts/${id}`));
}

export async function createProxy(
  apiKey: string,
  payload: CreateProxyPayload
): Promise<ProxyAccount> {
  return request<ProxyAccount>(apiKey, "POST", await teamPath(apiKey, "/proxy_accounts"), payload);
}

export async function updateProxy(
  apiKey: string,
  id: string,
  payload: Partial<CreateProxyPayload>
): Promise<ProxyAccount> {
  return request<ProxyAccount>(apiKey, "PUT", await teamPath(apiKey, `/proxy_accounts/${id}`), payload);
}

export async function deleteProxy(apiKey: string, id: string): Promise<void> {
  return request<void>(apiKey, "DELETE", await teamPath(apiKey, `/proxy_accounts/${id}`));
}

export async function resetQuota(apiKey: string, id: string): Promise<ProxyAccount> {
  return request<ProxyAccount>(
    apiKey, "POST", await teamPath(apiKey, `/proxy_accounts/${id}/reset-quota`), {}
  );
}

// v1 reset takes explicit ids (max 100 per call), so bulk = list all, then batch.
export async function bulkResetQuota(apiKey: string): Promise<number> {
  const ids: string[] = [];
  let page = 1;
  for (;;) {
    const { members, total } = await listProxies(apiKey, {
      page: String(page),
      itemsPerPage: "100",
    });
    ids.push(...members.map((m) => m.id));
    if (ids.length >= total || members.length === 0) break;
    page++;
  }
  for (let i = 0; i < ids.length; i += 100) {
    await request<ProxyAccount>(
      apiKey, "POST", await teamPath(apiKey, "/proxy_accounts/reset-quota"),
      { ids: ids.slice(i, i + 100) }
    );
  }
  return ids.length;
}

// ── ProxyProfile ───────────────────────────────────────────────────────────────

export async function listProfiles(
  apiKey: string,
  params?: { page?: string; itemsPerPage?: string; search?: string; proxy_account?: string }
): Promise<{ members: ProxyProfile[]; total: number }> {
  const data = await request<Collection<ProxyProfile>>(
    apiKey, "GET", await teamPath(apiKey, "/proxy_profiles"), undefined,
    params as Params
  );
  return { members: data.data ?? [], total: data.meta?.total ?? 0 };
}

export async function getProfile(apiKey: string, id: string): Promise<ProxyProfile> {
  return request<ProxyProfile>(apiKey, "GET", await teamPath(apiKey, `/proxy_profiles/${id}`));
}

export async function createProfile(
  apiKey: string,
  payload: ProxyProfile
): Promise<ProxyProfile> {
  return request<ProxyProfile>(apiKey, "POST", await teamPath(apiKey, "/proxy_profiles"), payload);
}

export async function updateProfile(
  apiKey: string,
  id: string,
  payload: Partial<ProxyProfile>
): Promise<ProxyProfile> {
  return request<ProxyProfile>(apiKey, "PUT", await teamPath(apiKey, `/proxy_profiles/${id}`), payload);
}

export async function deleteProfile(apiKey: string, id: string): Promise<void> {
  return request<void>(apiKey, "DELETE", await teamPath(apiKey, `/proxy_profiles/${id}`));
}

// ── Usage & Subscription ───────────────────────────────────────────────────────

export async function getTeamUsage(apiKey: string): Promise<Usage> {
  return request<Usage>(apiKey, "GET", await teamPath(apiKey, "/usage"));
}

export async function getProxyUsage(apiKey: string, id: string): Promise<Usage> {
  return request<Usage>(apiKey, "GET", await teamPath(apiKey, `/proxy_accounts/${id}/usage`));
}

export async function getSubscription(apiKey: string): Promise<Subscription> {
  return request<Subscription>(apiKey, "GET", await teamPath(apiKey, "/subscription"));
}

// ── Traffic ────────────────────────────────────────────────────────────────────
// GET /traffic returns a time series. date[after]/date[before] are required;
// interval is "hourly" or "daily".

export async function getTraffic(
  apiKey: string,
  params: {
    "date[after]": string;
    "date[before]": string;
    interval?: "hourly" | "daily";
    proxyAccounts?: string[];
  }
): Promise<TrafficPoint[]> {
  const query: Params = {
    "date[after]": params["date[after]"],
    "date[before]": params["date[before]"],
  };
  if (params.interval) query.interval = params.interval;
  if (params.proxyAccounts?.length) query["proxy_account[]"] = params.proxyAccounts;

  const data = await request<TrafficPoint[] | TrafficPoint>(
    apiKey, "GET", await teamPath(apiKey, "/traffic"), undefined, query
  );
  return Array.isArray(data) ? data : [data];
}

// The v1 API has no CSV export endpoint — build the CSV from the series.
export function trafficToCsv(points: TrafficPoint[]): string {
  const lines = ["timestamp,bytes_sent,bytes_recv,bytes_total"];
  for (const p of points) {
    lines.push(`${p.timestamp},${p.bytes_sent},${p.bytes_recv},${p.bytes_sent + p.bytes_recv}`);
  }
  return lines.join("\n") + "\n";
}
