import * as readline from "readline";
import type { ProxyProfile } from "./api.js";

// ── Interactive prompts ────────────────────────────────────────────────────────

export function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}

// Prompts with masked input (shows * per character). Falls back to plain ask in
// non-TTY environments (CI, piped input).
export function askSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY) return ask(question);

  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let input = "";

    const handler = (char: string) => {
      if (char === "\r" || char === "\n" || char === "") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", handler);
        process.stdout.write("\n");
        resolve(input);
      } else if (char === "") {
        process.stdout.write("\n");
        process.exit(1);
      } else if (char === "" || char === "\b") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        input += char;
        process.stdout.write("*");
      }
    };
    process.stdin.on("data", handler);
  });
}

// ── Shared proxy targeting spec ────────────────────────────────────────────────
// In API v1 the location/session configuration lives in a proxy *profile*
// attached to a proxy account (it used to be a port config on the account).

export interface ProxySpec {
  type?: "residential" | "mobile";
  country?: string;
  region?: string;
  city?: string;
  asn?: number;
  sticky?: boolean;      // sticky session vs rotating
  sessTime?: number;     // sticky duration in minutes
}

export function buildProxySpec(opts: {
  type?: string;
  country?: string;
  region?: string;
  city?: string;
  asn?: string | number;
  session?: string;
  sessTime?: string | number;
}): ProxySpec {
  const spec: ProxySpec = {};
  if (opts.type)     spec.type = opts.type as "residential" | "mobile";
  if (opts.country)  spec.country = opts.country.toUpperCase();
  if (opts.region)   spec.region = opts.region.toLowerCase();
  if (opts.city)     spec.city = opts.city.toLowerCase();
  if (opts.asn != null) {
    spec.asn = typeof opts.asn === "string" ? parseInt(opts.asn, 10) : opts.asn;
  }
  if (opts.session)  spec.sticky = true;
  if (opts.sessTime != null) {
    spec.sticky = true;
    spec.sessTime = typeof opts.sessTime === "string"
      ? parseInt(opts.sessTime, 10)
      : opts.sessTime;
  }
  return spec;
}

export function specHasTargeting(spec: ProxySpec): boolean {
  return !!(spec.type || spec.country || spec.region || spec.city || spec.asn || spec.sticky);
}

export function specToProfile(
  spec: ProxySpec,
  name: string,
  proxyAccountId: string
): ProxyProfile {
  return {
    name,
    proxy_account_id: proxyAccountId,
    proxy_type: spec.type ?? null,
    auth_method: "usernamePassword",
    proxy_protocol: "http",
    location: {
      country_code: spec.country ?? null,
      region: spec.region ?? null,
      city: spec.city ?? null,
      asn: spec.asn ?? null,
    },
    session: spec.sticky
      ? { type: "sticky", duration: spec.sessTime ?? 10080 }
      : { type: "rotating", duration: null },
  };
}
