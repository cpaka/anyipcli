// ─── anyIP.io REST API Client ─────────────────────────────────────────────────

export const BASE_URL = "https://dashboard.anyip.io";

export interface PortConfig {
  port?: number;
  type?: "residential" | "mobile";
  country?: string;
  region?: string;
  city?: string;
  session?: string;
  sess_time?: number;
  sess_replace?: boolean;
  sess_ip_collision?: "strict" | "loose";
}

export interface IpWhitelist {
  ips?: string[];
  ports?: PortConfig[];
  is_enabled?: boolean;
}

export interface ProxyAccount {
  id: string;
  description: string;
  username: string;
  hash?: string;
  enabled: boolean;
  enabled_by_admin?: boolean;
  is_active?: boolean;
  status?: string;
  quota: number;
  quota_str?: string;
  bytes_recv?: number;
  bytes_sent?: number;
  consumption?: number;
  consumption_str?: string;
  plain_password?: string;
  ip_whitelist?: IpWhitelist;
}

export interface CreateProxyPayload {
  description: string;
  enabled?: boolean;
  quota?: number;
  plain_password?: string;
  ip_whitelist?: IpWhitelist;
}

export interface User {
  id: string;
  email: string;
  username?: string;
  quota?: number;
  quota_str?: string;
  bytes_recv?: number;
  bytes_sent?: number;
  consumption?: number;
  consumption_str?: string;
}

export interface Traffic {
  _id?: { date?: string };
  date?: string;
  total_consumed?: number;
  nb_requests?: number;
}

export interface Country {
  name: string;
  value: string;  // ISO code, e.g. "US"
}

export interface Region {
  name: string;
  value: string;  // lowercase slug, e.g. "california"
}

export interface AsnEntry {
  name: string;
  value: number;  // ASN number
}

class AnyIPError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "AnyIPError";
  }
}

async function request<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const isWrite = method === "POST" || method === "PUT" || method === "PATCH";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      signal: controller.signal,
      headers: {
        "api-key": apiKey,
        "Content-Type": isWrite ? "application/json" : "application/ld+json",
        Accept: "application/ld+json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const text = await res.text();
      try {
        const err = JSON.parse(text) as { message?: string; "hydra:description"?: string };
        msg = err["hydra:description"] ?? err.message ?? (text || msg);
      } catch {
        if (text) msg = text;
      }
    } catch {}
    throw new AnyIPError(res.status, msg);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Data endpoints ─────────────────────────────────────────────────────────────
// Responses are plain JSON arrays, not Hydra collections.

export async function getCountries(apiKey: string): Promise<Country[]> {
  return request<Country[]>(apiKey, "GET", "/api/data/country");
}

export async function getRegions(apiKey: string, country: string): Promise<Region[]> {
  return request<Region[]>(apiKey, "GET", `/api/data/region/${country}`);
}

export async function getAsn(apiKey: string, country: string): Promise<AsnEntry[]> {
  return request<AsnEntry[]>(apiKey, "GET", `/api/data/asn/${country}`);
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
  const url = new URL(`${BASE_URL}/api/login`);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { message?: string; "hydra:description"?: string };
      msg = err["hydra:description"] ?? err.message ?? msg;
    } catch {}
    throw new AnyIPError(res.status, msg);
  }
  return res.json() as Promise<LoginResponse>;
}

// ── User ───────────────────────────────────────────────────────────────────────

export async function getMe(apiKey: string): Promise<User> {
  return request<User>(apiKey, "GET", "/api/users/me");
}

// ── ProxyAccount ───────────────────────────────────────────────────────────────

export async function listProxies(
  apiKey: string,
  params?: { page?: string; itemsPerPage?: string }
): Promise<{ members: ProxyAccount[]; total: number }> {
  const data = await request<{ "hydra:member": ProxyAccount[]; "hydra:totalItems": number }>(
    apiKey, "GET", "/api/proxy_accounts", undefined,
    params as Record<string, string>
  );
  return {
    members: data["hydra:member"] ?? [],
    total: data["hydra:totalItems"] ?? 0,
  };
}

export async function getProxy(apiKey: string, id: string): Promise<ProxyAccount> {
  return request<ProxyAccount>(apiKey, "GET", `/api/proxy_accounts/${id}`);
}

export async function createProxy(
  apiKey: string,
  payload: CreateProxyPayload
): Promise<ProxyAccount> {
  return request<ProxyAccount>(apiKey, "POST", "/api/proxy_accounts", payload);
}

export async function updateProxy(
  apiKey: string,
  id: string,
  payload: Partial<CreateProxyPayload>
): Promise<ProxyAccount> {
  return request<ProxyAccount>(apiKey, "PUT", `/api/proxy_accounts/${id}`, payload);
}

export async function bulkResetQuota(apiKey: string): Promise<void> {
  return request<void>(apiKey, "PUT", "/api/proxy_accounts/bulk_reset");
}

// ── Traffic ────────────────────────────────────────────────────────────────────
// Correct path is /api/traffics (plural).
// Date filter params use bracket notation: date[after], date[before].
// Proxy filter param: proxy_account (not proxyAccount).

export async function listTraffic(
  apiKey: string,
  params?: {
    page?: string;
    proxy_account?: string;
    "date[after]"?: string;
    "date[before]"?: string;
  }
): Promise<{ members: Traffic[]; total: number }> {
  const data = await request<{ "hydra:member": Traffic[]; "hydra:totalItems": number }>(
    apiKey, "GET", "/api/traffics", undefined,
    params as Record<string, string>
  );
  return {
    members: data["hydra:member"] ?? [],
    total: data["hydra:totalItems"] ?? 0,
  };
}

export async function exportTrafficCsv(
  apiKey: string,
  params?: { "date[after]"?: string; "date[before]"?: string; proxy_account?: string }
): Promise<string> {
  const url = new URL(`${BASE_URL}/api/traffics/export`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), { headers: { "api-key": apiKey } });
  if (!res.ok) throw new AnyIPError(res.status, `HTTP ${res.status}`);
  return res.text();
}
