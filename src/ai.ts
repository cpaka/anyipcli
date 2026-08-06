import Anthropic from "@anthropic-ai/sdk";
import type { CreateProxyPayload } from "./api.js";
import type { ProxySpec } from "./utils.js";

const MODEL = "claude-sonnet-4-6";

// ── Proxy plan generation ──────────────────────────────────────────────────────

export interface ProxyPlanItem {
  description: string;
  count: number;
  type: "residential" | "mobile";
  country: string | null;
  region: string | null;
  session_prefix: string;
  sess_time: number | null;
  rotating: boolean;
  quota_bytes: number;
  notes: string;
}

export interface ProxyPlan {
  analysis: string;
  proxy_plan: ProxyPlanItem[];
  rotation_strategy: string;
  total_proxies: number;
  estimated_total_quota_gb: number;
}

const PLAN_SYSTEM_PROMPT = `You are an expert proxy configuration advisor for web scraping, automation, and data collection.

Given a use case description, output a complete proxy deployment plan.

Think about:
- Anti-bot measures severity → residential is harder to detect than mobile; mobile is faster
- Geographic requirements → which countries/regions the target needs
- Session strategy → scraping = rotating; account management = sticky IPs (one per account)
- Volume estimation → request count × avg page size ≈ bandwidth
- Number of proxies → distribute load, avoid rate limits, one per account if needed

Respond ONLY with valid JSON (no markdown, no comments):
{
  "analysis": "2-3 sentence analysis of the use case and why this config is recommended",
  "proxy_plan": [
    {
      "description": "US Residential Rotating — Amazon.com price scraping",
      "count": 3,
      "type": "residential",
      "country": "US",
      "region": null,
      "session_prefix": "amz_us",
      "sess_time": null,
      "rotating": true,
      "quota_bytes": 5368709120,
      "notes": "Use round-robin. Rotate on 403 or CAPTCHA response."
    }
  ],
  "rotation_strategy": "brief instructions on how to use these proxies effectively",
  "total_proxies": 3,
  "estimated_total_quota_gb": 15
}

Rules:
- count per set: 1-10 (don't over-provision)
- quota_bytes: be realistic (1GB = 1073741824)
- rotating=true means no sticky session; rotating=false means sticky (one IP per session)
- session_prefix must be alphanumeric+underscore, max 12 chars
- If multiple countries needed, create one plan item per country`;

function parseJsonResponse<T>(text: string, context: string): T {
  const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(clean) as T;
  } catch {
    throw new Error(
      `${context}: Claude returned unexpected output (not valid JSON).\nRaw: ${clean.slice(0, 200)}`
    );
  }
}

export async function generateProxyPlan(claudeKey: string, description: string): Promise<ProxyPlan> {
  const client = new Anthropic({ apiKey: claudeKey });

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: PLAN_SYSTEM_PROMPT,
    messages: [{ role: "user", content: description }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  return parseJsonResponse<ProxyPlan>(text, "generateProxyPlan");
}

// ── Natural language → proxy config ───────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert assistant for anyIP.io proxy management.

When a user describes what they want in natural language, you extract structured proxy configuration from it.

## anyIP Proxy Config Schema
- type: "residential" | "mobile"  (residential = broadband/WiFi, mobile = 4G/5G)
- country: ISO 3166-1 alpha-2 (e.g. "US", "FR", "DE", "TH")
- region: state or region name lowercase (e.g. "texas", "california", "ile-de-france")
- city: city name lowercase (e.g. "paris", "dallas", "berlin")
- asn: ISP/carrier ASN number (integer) if a specific ISP is requested
- sticky: true = keep the same IP per session; false = rotate IP per request
- sess_time: sticky duration in minutes (1-10080, default 10080 = 7 days)

## Response format
Respond ONLY with valid JSON, no markdown, no explanation:
{
  "description": "short human-readable description of what this proxy does",
  "quota_bytes": <bytes as integer, default 1073741824 = 1GB if not specified>,
  "proxy_config": {
    "type": "residential"|"mobile"|null,
    "country": "XX"|null,
    "region": "name"|null,
    "city": "name"|null,
    "asn": <int>|null,
    "sticky": <bool>,
    "sess_time": <int>|null
  },
  "clarification_needed": null | "what extra info would help"
}`;

interface NLProxyConfig {
  type?: "residential" | "mobile" | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  asn?: number | null;
  sticky?: boolean | null;
  sess_time?: number | null;
}

interface NLResult {
  description: string;
  quota_bytes: number;
  proxy_config: NLProxyConfig;
  clarification_needed: string | null;
}

export async function parseNaturalLanguage(claudeKey: string, prompt: string): Promise<NLResult> {
  const client = new Anthropic({ apiKey: claudeKey });

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  return parseJsonResponse<NLResult>(text, "parseNaturalLanguage");
}

// v1 splits creation in two: the account payload, plus a profile spec that
// carries the location/session targeting (see utils.specToProfile).
export function nlResultToPayload(result: NLResult): { account: CreateProxyPayload; spec: ProxySpec } {
  const pc = result.proxy_config;
  const spec: ProxySpec = {};
  if (pc.type)              spec.type = pc.type;
  if (pc.country)           spec.country = pc.country;
  if (pc.region)            spec.region = pc.region;
  if (pc.city)              spec.city = pc.city;
  if (pc.asn != null)       spec.asn = pc.asn;
  if (pc.sticky != null)    spec.sticky = pc.sticky;
  if (pc.sess_time != null) { spec.sticky = true; spec.sessTime = pc.sess_time; }

  return {
    account: {
      description: result.description,
      enabled: true,
      quota_bytes: result.quota_bytes ?? 1_073_741_824,
    },
    spec,
  };
}

// ── Intent detection ───────────────────────────────────────────────────────────

type Intent =
  | { action: "create"; prompt: string }
  | { action: "list" }
  | { action: "inspect"; id: string }
  | { action: "traffic" }
  | { action: "user" }
  | { action: "countries" }
  | { action: "help" }
  | { action: "unknown"; prompt: string };

export async function detectIntent(claudeKey: string, input: string): Promise<Intent> {
  const client = new Anthropic({ apiKey: claudeKey });

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 128,
    system: `Classify the user's intent for a proxy management CLI.
Respond ONLY with JSON: {"action": "create"|"list"|"inspect"|"traffic"|"user"|"countries"|"help"|"unknown", "id": "<proxy id if action=inspect>|null"}
- create: user wants to create/register/add a new proxy
- list: user wants to see/list/show their proxies
- inspect: user wants details about a specific proxy (extract its ID)
- traffic: user asks about traffic, usage, domains
- user: user asks about their account/balance
- countries: user asks what countries/regions are available
- help: user asks for help or commands
- unknown: none of the above`,
    messages: [{ role: "user", content: input }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const parsed = parseJsonResponse<{ action: string; id?: string }>(text, "detectIntent");
  const { action, id } = parsed;

  if (action === "create")    return { action: "create", prompt: input };
  if (action === "list")      return { action: "list" };
  if (action === "inspect")   return { action: "inspect", id: id ?? "" };
  if (action === "traffic")   return { action: "traffic" };
  if (action === "user")      return { action: "user" };
  if (action === "countries") return { action: "countries" };
  if (action === "help")      return { action: "help" };
  return { action: "unknown", prompt: input };
}
