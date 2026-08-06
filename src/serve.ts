import http from "node:http";
import { URL } from "node:url";
import { exec } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { config } from "./config.js";
import * as api from "./api.js";
import * as sessions from "./sessions.js";
import { EN_MANUAL } from "./manual/en.js";
import { FR_MANUAL } from "./manual/fr.js";
import { ES_MANUAL } from "./manual/es.js";
import { ZH_MANUAL } from "./manual/zh.js";
import { RU_MANUAL } from "./manual/ru.js";
import chalk from "chalk";

function getAnyipKey(): string {
  return process.env.ANYIP_API_KEY ?? (config.get("anyipKey") as string) ?? "";
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

function json(res: http.ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const key = getAnyipKey();

  try {
    if (path === "/" && method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buildHtml());
      return;
    }

    if (path === "/api/me" && method === "GET") {
      const [me, usage, subscription] = await Promise.all([
        api.getMe(key),
        api.getTeamUsage(key).catch(() => undefined),
        api.getSubscription(key).catch(() => undefined),
      ]);
      return json(res, 200, { ...me, usage, subscription });
    }

    if (path === "/api/accounts" && method === "GET") {
      const page = url.searchParams.get("page") ?? "1";
      return json(res, 200, await api.listProxies(key, { page, itemsPerPage: "50" }));
    }

    if (path === "/api/accounts" && method === "POST") {
      const raw = (await readBody(req)) as Record<string, unknown>;
      // Dashboard-only fields (not part of the v1 API payload)
      const connectionType = (raw._connectionType as string | undefined) ?? "http";
      const spec = (raw._spec as {
        type?: "residential" | "mobile";
        country?: string;
        session?: string;
        sess_time?: number;
      } | undefined) ?? {};

      const proxy = await api.createProxy(key, {
        description: raw.description as string | undefined,
        enabled: (raw.enabled as boolean | undefined) ?? true,
        password: raw.password as string | undefined,
        quota_bytes: raw.quota_bytes as number | undefined,
      });

      // Auto-save as local session if the API returns credentials.
      // Targeting is applied via username flags, which the network still honors.
      if (proxy.username && proxy.password) {
        const networkType = spec.type ?? "residential";
        const country = spec.country;
        const sessionName = spec.session;
        const isRotating = !sessionName;
        const port = connectionType === "socks5" ? 1080 : 8080;

        const userParts = [
          "user_" + proxy.username,
          "type_" + networkType,
          country    ? "country_"  + country    : null,
          sessionName ? "session_" + sessionName : null,
          spec.sess_time ? "sesstime_" + spec.sess_time : null,
        ].filter(Boolean).join(",");

        sessions.saveSession({
          name: sessionName ?? ("rotating_" + Math.random().toString(16).slice(2, 10)),
          networkType,
          connectionType,
          server: "portal.anyip.io",
          port,
          username: userParts,
          password: proxy.password,
          country,
          sessTime: spec.sess_time,
          rotating: isRotating,
          createdAt: new Date().toISOString(),
          userTag: proxy.username,
        });
      }

      return json(res, 201, proxy);
    }

    const accountMatch = path.match(/^\/api\/accounts\/([^/]+)$/);
    if (accountMatch && method === "PUT") {
      const body = await readBody(req);
      return json(res, 200, await api.updateProxy(key, accountMatch[1], body as Partial<api.CreateProxyPayload>));
    }

    if (path === "/api/sessions" && method === "GET") {
      return json(res, 200, sessions.listSessions());
    }

    if (path === "/api/manual" && method === "GET") {
      const lang = url.searchParams.get("lang") ?? "en";
      const manuals: Record<string, string> = {
        en: EN_MANUAL, fr: FR_MANUAL, es: ES_MANUAL, zh: ZH_MANUAL, ru: RU_MANUAL,
      };
      return json(res, 200, { content: manuals[lang] ?? EN_MANUAL });
    }

    const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch && method === "DELETE") {
      const name = decodeURIComponent(sessionMatch[1]);
      const deleted = sessions.deleteSession(name);
      return json(res, deleted ? 200 : 404, { deleted, name });
    }

    json(res, 404, { error: "Not found" });
  } catch (err) {
    try { json(res, 500, { error: String(err) }); } catch { /* headers already sent */ }
  }
}

async function findPort(preferred: number): Promise<number> {
  for (let p = preferred; p < preferred + 20; p++) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = http.createServer();
      probe.once("error", () => resolve(false));
      probe.once("listening", () => { probe.close(); resolve(true); });
      probe.listen(p, "127.0.0.1");
    });
    if (free) return p;
  }
  throw new Error("No free port in range " + preferred + "-" + (preferred + 19));
}

function printSessionsTable(): void {
  const list = sessions.listSessions()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  console.log(
    "\n  " + chalk.bold.hex("#5C0FBA")("⬡  anyIP CLI") +
    chalk.dim("  — Saved Proxies (" + list.length + ")")
  );

  if (!list.length) {
    console.log(chalk.dim("  No saved proxies yet.\n"));
    return;
  }

  // Inner content widths (excludes 1-space padding on each side)
  const CW = [2, 12, 22, 10, 26, 16, 10];

  const hline = (l: string, m: string, r: string) =>
    l + CW.map(w => "─".repeat(w + 2)).join(m) + r;

  const cell = (s: string, w: number) => {
    const t = s.length > w ? s.slice(0, w - 1) + "…" : s.padEnd(w);
    return " " + t + " ";
  };

  const row = (cols: string[]) =>
    "│" + cols.map((c, i) => cell(c, CW[i])).join("│") + "│";

  const buildLocation = (s: ReturnType<typeof sessions.listSessions>[number]) => {
    const parts: string[] = [];
    if (s.country) parts.push(s.country);
    if (s.region)  parts.push(s.region);
    if (s.city)    parts.push(s.city);
    if (s.asn)     parts.push("ASN" + s.asn);
    return parts.join(", ");
  };

  const wrapLocation = (text: string): string[] => {
    const w = CW[4];
    if (!text || text.length <= w) return [text || ""];
    const words = text.split(", ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const piece = current ? current + ", " + word : word;
      if (piece.length <= w) {
        current = piece;
      } else {
        lines.push(current ? current + "," : "");
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  console.log("");
  console.log(hline("┌", "┬", "┐"));
  console.log(row(["#", "User", "Session Name", "Type", "Location", "Last IP", "Saved"]));

  list.forEach((s, i) => {
    console.log(hline("├", "┼", "┤"));

    const userLabel = "user_" + sessions.resolveUserTag(s);
    const typeLabel = s.rotating ? "rotating" : s.networkType;
    const lastIp    = s.lastIp ?? "—";
    const saved     = s.createdAt ? s.createdAt.slice(0, 10) : "—";
    const locLines  = wrapLocation(buildLocation(s));

    locLines.forEach((loc, r) => {
      console.log(row([
        r === 0 ? String(i + 1) : "",
        r === 0 ? userLabel     : "",
        r === 0 ? s.name        : "",
        r === 0 ? typeLabel     : "",
        loc,
        r === 0 ? lastIp        : "",
        r === 0 ? saved         : "",
      ]));
    });
  });

  console.log(hline("└", "┴", "┘"));
  console.log("");
}

export async function startServer(preferredPort: number): Promise<void> {
  printSessionsTable();

  const port = await findPort(preferredPort);
  if (port !== preferredPort) {
    console.log(chalk.yellow("  Port " + preferredPort + " busy — using " + port));
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error("  Request error:", err);
      if (!res.headersSent) {
        try {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        } catch { /* socket already closed */ }
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.listen(port, "127.0.0.1", resolve);
    server.on("error", reject);
  });

  const url = "http://127.0.0.1:" + port;
  console.log("\n  " + chalk.bold.cyan("anyIP Proxy Manager") + "  " + chalk.dim(url) + "\n");
  console.log("  " + chalk.dim("Press Ctrl+C to stop") + "\n");

  const openCmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open";
  exec(openCmd + " " + url);

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      server.close();
      console.log(chalk.dim("\n  Stopped.\n"));
      resolve();
    });
  });
}


// ── HTML ──────────────────────────────────────────────────────────────────────

const _htmlDir = dirname(fileURLToPath(import.meta.url));

function buildHtml(): string {
  // Resolve proxy-manager.html relative to this file (works in both src/ and dist/)
  const htmlPath = join(_htmlDir, "..", "proxy-manager.html");
  return readFileSync(htmlPath, "utf-8");
}
