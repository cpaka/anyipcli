import * as readline from "readline";
import type { PortConfig } from "./api.js";

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

// ── Shared proxy builder ───────────────────────────────────────────────────────

export function buildPortConfig(opts: {
  type?: string;
  country?: string;
  region?: string;
  city?: string;
  session?: string;
  sessTime?: string | number;
}): PortConfig {
  const pc: PortConfig = {};
  if (opts.type)     pc.type = opts.type as "residential" | "mobile";
  if (opts.country)  pc.country = opts.country.toUpperCase();
  if (opts.region)   pc.region = opts.region.toLowerCase();
  if (opts.city)     pc.city = opts.city.toLowerCase();
  if (opts.session)  pc.session = opts.session;
  if (opts.sessTime != null) {
    pc.sess_time = typeof opts.sessTime === "string"
      ? parseInt(opts.sessTime, 10)
      : opts.sessTime;
  }
  return pc;
}

export function portConfigToPayload(
  pc: PortConfig,
  opts: { description: string; quota: number; password?: string }
) {
  return {
    description: opts.description,
    enabled: true as const,
    quota: opts.quota,
    plain_password: opts.password,
    ip_whitelist: {
      ips: [] as string[],
      ports: Object.keys(pc).length > 0 ? [pc] : [],
      is_enabled: false,
    },
  };
}
