import Anthropic from "@anthropic-ai/sdk";
import type { CreateProxyPayload } from "./api.js";
import type { ProxySpec } from "./utils.js";

const MODEL = "claude-sonnet-4-6";

// Planning is the one call whose output quality the user actually reads, so it
// runs on the strongest model with adaptive thinking; the cheap classifiers
// below stay on Sonnet.
const PLAN_MODEL = "claude-opus-5";

// ── Proxy plan generation ──────────────────────────────────────────────────────

export interface ProxyPlanItem {
  description: string;
  count: number;
  type: "residential" | "mobile";
  country: string | null;
  region: string | null;
  city: string | null;
  asn: number | null;
  pool: string | null;
  session_prefix: string;
  sess_time: number | null;
  rotating: boolean;
  quota_bytes: number;
  notes: string;
}

// One row of the "why this flag" table printed under each setup.
export interface FlagExplanation {
  flag: string;   // e.g. "type_residential"
  value: string;  // e.g. "residential" — what it resolves to for this setup
  why: string;    // why this use case needs it
}

export interface ProxyOption {
  name: string;
  kind: "recommended" | "alternative";
  summary: string;
  best_for: string;
  tradeoff: string;
  username_example: string;
  flags: FlagExplanation[];
  proxy_plan: ProxyPlanItem[];
  total_proxies: number;
  estimated_total_quota_gb: number;
}

export interface ProxyPlan {
  analysis: string;
  options: ProxyOption[];      // [0] is the recommended setup, then alternatives
  rotation_strategy: string;
}

// anyIP applies every setting through username flags, so a plan is only useful
// if it speaks in those flags — this is the cheat sheet from
// https://anyip.io/docs/guides/configuration.
const FLAG_REFERENCE = `anyIP username format: user_[ID],[flag],[flag]…  (comma-separated; pipes also work)

Network:   type_residential | type_mobile
Location:  country_[ISO]                 country code, uppercase
           region_[slug]                 requires country_
           city_[slug]                   requires country_ and region_
           asn_[number]                  pin one ISP/carrier
           pool_[name]                   broad area, e.g. pool_europe (alternative to country_)
           lat_[x],lon_[y]               closest peer to a GPS point (no country_ needed)
Sessions:  session_[name]                sticky — same IP until it drops or sesstime expires
           sesstime_[minutes]            sticky duration (default 7 days)
           sessreplace_false             fail instead of silently swapping IP when the peer drops
           sessasn_strict                a replacement IP must sit on the same ASN
Omitting session_ entirely = rotating: a new IP on every request.`;

const PLAN_SYSTEM_PROMPT = `You are an expert proxy configuration advisor for web scraping, automation, and data collection on the anyIP network.

Given a use case, produce ONE recommended setup plus 2-3 genuinely different alternatives, and explain every username flag you pick.

${FLAG_REFERENCE}

How to think:
- Anti-bot severity → residential blends in as home traffic; mobile carries carrier-grade NAT trust (many real users behind one IP) but costs more and is slower
- Geography → what the target actually serves per country/region/city; do not add locations the use case has no need for
- Session strategy → stateless scraping wants rotating; logins, carts, multi-step flows and account work want session_ (one per account/worker), usually with sesstime_
- Volume → requests x average page size ~ bandwidth; be honest rather than generous
- Fan-out → more proxies spread rate limits, but each one costs quota

The alternatives must differ in KIND, not just in counts — e.g. a cheaper/leaner setup, a higher-trust mobile setup, a sticky-session setup for logged-in flows, an ASN- or city-pinned setup, or a pool_ setup for broad coverage. Say plainly what each one gives up.

Rules:
- options[0] is the recommended setup and must have kind "recommended"; every other entry has kind "alternative"
- 3 or 4 options in total (recommended + 2-3 alternatives)
- flags: list every flag that setup's username carries, one row each, with a use-case-specific reason. Do not explain flags the setup does not use.
- username_example: a realistic full username for that setup, e.g. user_XXXX,type_residential,country_US,session_scrape_1
- count per plan item: 1-10; quota_bytes realistic (1 GB = 1073741824)
- rotating=true means no session_ flag; rotating=false means sticky (session_prefix is then required)
- session_prefix: alphanumeric + underscore, max 12 chars
- one plan item per country/region combination
- rotation_strategy: how to drive these proxies day to day — rotation triggers, backoff, concurrency, headers. Applies to the recommended setup.
- analysis: 2-3 sentences on the target's defences and why the recommended setup fits`;

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["analysis", "options", "rotation_strategy"],
  properties: {
    analysis: { type: "string" },
    rotation_strategy: { type: "string" },
    options: {
      // The 3-4 count is a prompt rule: structured outputs reject minItems > 1.
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name", "kind", "summary", "best_for", "tradeoff",
          "username_example", "flags", "proxy_plan",
          "total_proxies", "estimated_total_quota_gb",
        ],
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["recommended", "alternative"] },
          summary: { type: "string" },
          best_for: { type: "string" },
          tradeoff: { type: "string" },
          username_example: { type: "string" },
          total_proxies: { type: "integer" },
          estimated_total_quota_gb: { type: "number" },
          flags: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["flag", "value", "why"],
              properties: {
                flag: { type: "string" },
                value: { type: "string" },
                why: { type: "string" },
              },
            },
          },
          proxy_plan: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "description", "count", "type", "country", "region", "city",
                "asn", "pool", "session_prefix", "sess_time", "rotating",
                "quota_bytes", "notes",
              ],
              properties: {
                description: { type: "string" },
                count: { type: "integer" },
                type: { type: "string", enum: ["residential", "mobile"] },
                country: { type: ["string", "null"] },
                region: { type: ["string", "null"] },
                city: { type: ["string", "null"] },
                asn: { type: ["integer", "null"] },
                pool: { type: ["string", "null"] },
                session_prefix: { type: "string" },
                sess_time: { type: ["integer", "null"] },
                rotating: { type: "boolean" },
                quota_bytes: { type: "integer" },
                notes: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

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

  // Structured outputs — the schema is enforced server-side, so the reply
  // cannot come back as prose or half-formed JSON.
  const msg = await client.messages.create({
    model: PLAN_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: PLAN_SCHEMA } },
    system: PLAN_SYSTEM_PROMPT,
    messages: [{ role: "user", content: description }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const plan = parseJsonResponse<ProxyPlan>(text, "generateProxyPlan");
  // Keep the recommended setup first whatever order it comes back in.
  plan.options.sort((a, b) => (a.kind === "recommended" ? -1 : b.kind === "recommended" ? 1 : 0));
  return plan;
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
