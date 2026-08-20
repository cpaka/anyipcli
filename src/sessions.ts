import Conf from "conf";
import { hardenAfterWrites, hardenPermissions } from "./config.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProxySession {
  name: string;          // sticky session label (e.g. "dced3cd8")
  networkType: string;   // mobile | residential | …
  connectionType: string; // socks5 | http
  server: string;        // portal.anyip.io
  port: number;
  username: string;      // full composite username
  password: string;
  country?: string;
  region?: string;
  city?: string;
  asn?: string;
  pool?: string;         // broad-area pool (pool_europe) — used instead of country
  sessTime?: number;     // minutes (sesstime_NN flag)
  rotating?: boolean;    // true = no sticky session, new IP per connection
  createdAt: string;     // ISO date string
  lastIp?: string;       // IP returned by last curl test
  lastTested?: string;   // ISO date of last curl test
  userTag?: string;      // proxy account username (e.g. "3c035b")
}

interface SessionStore {
  sessions: Record<string, ProxySession>;
}

// ── Storage ────────────────────────────────────────────────────────────────────

const store = new Conf<SessionStore>({
  projectName: "anyip-cli",
  configName: "sessions",
  schema: {
    sessions: { type: "object" },
  },
  defaults: { sessions: {} },
});

// ── Parse a connection string ──────────────────────────────────────────────────
//
// Format: server:port:username:password
// username: user_X,type_Y,country_Z,region_R,city_C,asn_N,sesstime_T,session_S
//
export function parseConnectionString(raw: string): ProxySession {
  const trimmed = raw.trim();

  // Split only on first 2 colons (server, port) and last colon (password).
  // Everything in the middle is the username (which may contain colons in theory,
  // but currently doesn't — so a simple 4-part split is safe).
  const parts = trimmed.split(":");
  if (parts.length < 4) {
    throw new Error(`Invalid connection string (expected server:port:username:password): ${trimmed}`);
  }

  const server = parts[0];
  const port = parseInt(parts[1], 10);
  // username is parts[2], password is parts[3] (handles any remaining colons)
  const username = parts[2];
  const password = parts.slice(3).join(":");

  const attrs: Record<string, string> = {};
  for (const segment of username.split(",")) {
    const idx = segment.indexOf("_");
    if (idx === -1) continue;
    const key = segment.slice(0, idx).toLowerCase();
    const val = segment.slice(idx + 1);
    attrs[key] = val;
  }

  const rotating = !attrs["session"];
  const sessionName = attrs["session"] ?? `rotating_${Date.now()}`;
  const connectionType = port === 1080 ? "socks5" : "http";

  // Extract the account username from the first segment (user_XXXX → XXXX)
  const firstSegment = username.split(",")[0] ?? "";
  const userTag = firstSegment.startsWith("user_") ? firstSegment.slice(5) : undefined;

  return {
    name: sessionName,
    networkType: attrs["type"] ?? "unknown",
    connectionType,
    server,
    port,
    username,
    password,
    country: attrs["country"],
    region: attrs["region"],
    city: attrs["city"],
    asn: attrs["asn"],
    pool: attrs["pool"],
    sessTime: attrs["sesstime"] ? parseInt(attrs["sesstime"], 10) : undefined,
    rotating,
    createdAt: new Date().toISOString(),
    userTag,
  };
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

// Sessions hold proxy passwords, so the same owner-only rule applies here.
hardenPermissions(store.path);
hardenAfterWrites(store, ["set", "delete", "clear", "reset"]);

export function saveSession(session: ProxySession): void {
  const sessions = store.get("sessions");
  sessions[session.name] = session;
  store.set("sessions", sessions);
}

export function listSessions(): ProxySession[] {
  return Object.values(store.get("sessions"));
}

export function getSession(name: string): ProxySession | undefined {
  return store.get("sessions")[name];
}

export function deleteSession(name: string): boolean {
  const sessions = store.get("sessions");
  if (!sessions[name]) return false;
  delete sessions[name];
  store.set("sessions", sessions);
  return true;
}

export function clearSessions(): void {
  store.set("sessions", {});
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Derive userTag from username if not stored (backwards compat)
export function resolveUserTag(s: ProxySession): string {
  if (s.userTag) return s.userTag;
  const first = s.username.split(",")[0] ?? "";
  return first.startsWith("user_") ? first.slice(5) : "—";
}

export function buildCurlCommand(s: ProxySession): string {
  return `curl -v --proxy ${s.server}:${s.port} --proxy-user "${s.username}":${s.password} http://ip-api.com/json/`;
}

export function buildProxyUrl(s: ProxySession, scheme = "http"): string {
  return `${scheme}://${s.username}:${s.password}@${s.server}:${s.port}`;
}

// The formats the dashboard's Proxies tab offers, so `anyip proxy list
// --format` and the picker there produce identical strings.
export type ProxyFormat = "hostuser" | "userhost" | "http" | "https" | "socks5";

// `changeUrl` appends the account's rotation link in brackets, the shape the
// dashboard's "Get proxy details" uses:
//   host:port:user:pass[https://dashboard.anyip.io/api/invalidate/<hash>/<session>]
export function buildProxyString(
  s: ProxySession,
  format: ProxyFormat = "hostuser",
  changeUrl?: string
): string {
  let str: string;
  switch (format) {
    case "userhost": str = `${s.username}:${s.password}@${s.server}:${s.port}`; break;
    case "http":     str = buildProxyUrl(s, "http"); break;
    case "https":    str = buildProxyUrl(s, "https"); break;
    case "socks5":   str = buildProxyUrl(s, "socks5"); break;
    default:         str = `${s.server}:${s.port}:${s.username}:${s.password}`;
  }
  return changeUrl ? `${str}[${changeUrl}]` : str;
}
