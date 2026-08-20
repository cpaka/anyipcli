import chalk from "chalk";
import Table from "cli-table3";
import type { ProxyAccount, User, TrafficPoint, Usage, Subscription, City, Region } from "./api.js";
import type { ProxySession } from "./sessions.js";
import { buildCurlCommand, buildProxyString, buildProxyUrl, resolveUserTag } from "./sessions.js";
import type { ProxyFormat } from "./sessions.js";

// ── Bytes formatter ────────────────────────────────────────────────────────────
export function fmtBytes(bytes?: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(2)} ${units[i]}`;
}

// ── Relative time ──────────────────────────────────────────────────────────────
export function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

// ── Status badge ───────────────────────────────────────────────────────────────
export function statusBadge(proxy: ProxyAccount): string {
  if (!proxy.enabled) return chalk.gray("DISABLED");
  if (proxy.is_active === false) return chalk.yellow("INACTIVE");
  if (proxy.status === "ACCOUNT_BLOCKED") return chalk.red("BLOCKED");
  return chalk.green("ACTIVE");
}

// ── Users table (indexed, for use with --user N) ──────────────────────────────
export function printUsersTable(proxies: ProxyAccount[]): void {
  const table = new Table({
    head: [
      chalk.cyan("#"),
      chalk.cyan("Username"),
      chalk.cyan("Description"),
      chalk.cyan("Status"),
      chalk.cyan("Consumed"),
    ],
    style: { head: [], border: ["gray"] },
    colWidths: [4, 16, 28, 10, 14],
    wordWrap: true,
  });

  proxies.forEach((p, i) => {
    table.push([
      chalk.yellow(String(i + 1)),
      chalk.white(`user_${p.username ?? "—"}`),
      chalk.dim(p.description ?? "—"),
      statusBadge(p),
      fmtBytes(p.consumption_bytes ?? undefined),
    ]);
  });

  console.log(table.toString());
}

// ── Proxy table ────────────────────────────────────────────────────────────────
export function printProxiesTable(proxies: ProxyAccount[]): void {
  const table = new Table({
    head: [
      chalk.cyan("ID"),
      chalk.cyan("Username"),
      chalk.cyan("Description"),
      chalk.cyan("Status"),
      chalk.cyan("Quota"),
      chalk.cyan("Used"),
    ],
    style: { head: [], border: ["gray"] },
    colWidths: [10, 26, 22, 10, 12, 12],
    wordWrap: true,
  });

  for (const p of proxies) {
    table.push([
      chalk.dim(p.id.slice(-8)),
      chalk.white(p.username ?? "—"),
      chalk.dim(p.description ?? "—"),
      statusBadge(p),
      p.quota_bytes ? fmtBytes(p.quota_bytes) : chalk.dim("team"),
      fmtBytes(p.consumption_bytes ?? undefined),
    ]);
  }

  console.log(table.toString());
}

// ── Proxy detail card ──────────────────────────────────────────────────────────
export function printProxyCard(p: ProxyAccount): void {
  const sep = chalk.gray("─".repeat(52));
  console.log(`\n${sep}`);
  console.log(chalk.bold.cyan("  Proxy Account"));
  console.log(sep);
  const row = (label: string, val: string) =>
    console.log(`  ${chalk.dim(label.padEnd(20))} ${val}`);

  row("ID", chalk.white(p.id));
  row("Username", chalk.yellow(p.username ?? "—"));
  row("Description", p.description ?? "—");
  row("Status", statusBadge(p));
  row("Quota", p.quota_bytes ? fmtBytes(p.quota_bytes) : chalk.dim("team quota"));
  row("Used", fmtBytes(p.consumption_bytes ?? undefined));
  if (p.last_activity_at) row("Last activity", chalk.dim(p.last_activity_at.slice(0, 10)));

  // Proxy URL
  if (p.username && p.password) {
    console.log(`\n  ${chalk.dim("Proxy URL:")}`);
    console.log(
      chalk.green(
        `  http://${p.username}:${p.password}@gate.anyip.io:8080`
      )
    );
  }
  console.log(sep + "\n");
}

// ── User card ──────────────────────────────────────────────────────────────────
export function printUserCard(u: User, usage?: Usage, sub?: Subscription): void {
  const sep = chalk.gray("─".repeat(52));
  console.log(`\n${sep}`);
  console.log(chalk.bold.cyan("  Account Info"));
  console.log(sep);
  const row = (label: string, val: string) =>
    console.log(`  ${chalk.dim(label.padEnd(20))} ${val}`);
  row("Email", chalk.white(u.email ?? "—"));
  if (u.default_team?.name) row("Team", chalk.white(u.default_team.name));
  if (sub?.plan?.name) {
    row("Plan", chalk.yellow(sub.plan.name) + (sub.status ? chalk.dim(`  (${sub.status})`) : ""));
    if (sub.valid_until) row("Valid until", chalk.white(sub.valid_until.slice(0, 10)));
  }
  if (usage) {
    row("Quota", fmtBytes(usage.quota_bytes));
    row("Used", fmtBytes(usage.consumption_bytes));
    row("Remaining", chalk.green(fmtBytes(usage.remaining_bytes)));
    row("Proxy accounts", `${usage.proxy_accounts_used} / ${usage.proxy_account_quota}`);
  }
  console.log(sep + "\n");
}

// ── Traffic table ──────────────────────────────────────────────────────────────
export function printTrafficTable(items: TrafficPoint[]): void {
  const table = new Table({
    head: [chalk.cyan("Date"), chalk.cyan("Sent"), chalk.cyan("Received"), chalk.cyan("Total")],
    style: { head: [], border: ["gray"] },
    colWidths: [22, 14, 14, 14],
    wordWrap: true,
  });
  for (const t of items) {
    const date = t.timestamp ? t.timestamp.replace("T", " ").slice(0, 16) : "—";
    table.push([
      chalk.dim(date),
      fmtBytes(t.bytes_sent),
      fmtBytes(t.bytes_recv),
      chalk.white(fmtBytes(t.bytes_sent + t.bytes_recv)),
    ]);
  }
  console.log(table.toString());
}

// ── Sessions table ─────────────────────────────────────────────────────────────
// ── Saved proxies ──────────────────────────────────────────────────────────────
// Mirrors the dashboard's Proxies tab: network, session type, session name,
// connection, location, then the proxy string itself on its own line — it is
// 100+ characters and would be unreadable squeezed into a column.
export function printSessionsTable(
  sessions: ProxySession[],
  format: ProxyFormat = "hostuser"
): void {
  const rows = sessions.map((s, i) => ({
    n: String(i + 1),
    network: s.networkType === "mobile" ? "Mobile" : "Residential",
    user: `user_${resolveUserTag(s)}`,
    kind: s.rotating ? "Rotating" : "Sticky",
    session: s.rotating ? "per request" : s.name,
    conn: (s.connectionType || "http").toUpperCase(),
    location:
      [
        s.pool ? `pool:${s.pool}` : s.country,
        s.region,
        s.city,
        s.asn && `ASN${s.asn}`,
      ].filter(Boolean).join(" · ") || "Global",
    created: timeAgo(s.createdAt),
    lastIp: s.lastIp ?? "",
    proxy: buildProxyString(s, format),
  }));

  const w = (key: keyof (typeof rows)[number], head: string) =>
    Math.max(head.length, ...rows.map((r) => r[key].length)) + 2;
  const cols = {
    n: w("n", "#"),
    user: w("user", "ACCOUNT"),
    network: w("network", "NETWORK"),
    kind: w("kind", "TYPE"),
    session: w("session", "SESSION"),
    conn: w("conn", "CONN"),
    location: w("location", "LOCATION"),
  };

  console.log(
    "  " +
      chalk.cyan(
        "#".padEnd(cols.n) +
          "ACCOUNT".padEnd(cols.user) +
          "NETWORK".padEnd(cols.network) +
          "TYPE".padEnd(cols.kind) +
          "SESSION".padEnd(cols.session) +
          "CONN".padEnd(cols.conn) +
          "LOCATION".padEnd(cols.location) +
          "CREATED"
      )
  );

  for (const r of rows) {
    console.log(
      "  " +
        chalk.dim(r.n.padEnd(cols.n)) +
        chalk.yellow(r.user.padEnd(cols.user)) +
        chalk.white(r.network.padEnd(cols.network)) +
        (r.kind === "Rotating"
          ? chalk.magenta(r.kind.padEnd(cols.kind))
          : chalk.cyan(r.kind.padEnd(cols.kind))) +
        chalk.white(r.session.padEnd(cols.session)) +
        chalk.dim(r.conn.padEnd(cols.conn)) +
        chalk.white(r.location.padEnd(cols.location)) +
        chalk.dim(r.created)
    );
    console.log(
      "  " +
        " ".repeat(cols.n) +
        chalk.dim(r.proxy) +
        (r.lastIp ? chalk.green(`   last IP ${r.lastIp}`) : "")
    );
  }
}

// ── Session detail card ────────────────────────────────────────────────────────
export function printSessionCard(s: ProxySession): void {
  const sep = chalk.gray("─".repeat(62));
  console.log(`\n${sep}`);
  console.log(chalk.bold.cyan("  Saved Proxy Session"));
  console.log(sep);
  const row = (label: string, val: string) =>
    console.log(`  ${chalk.dim(label.padEnd(22))} ${val}`);

  row("Session Name",    chalk.white(s.name));
  row("Network Type",    chalk.cyan(s.networkType));
  row("Session Mode",    s.rotating ? chalk.magenta("ROTATING") : chalk.green("STICKY"));
  row("Connection Type", chalk.cyan(s.connectionType.toUpperCase()));
  row("Server",          chalk.white(`${s.server}:${s.port}`));
  row("Username",        chalk.yellow(s.username));
  row("Password",        chalk.dim(s.password));
  if (s.pool)      row("Pool",     chalk.white(s.pool));
  if (s.country)   row("Country",  chalk.white(s.country));
  if (s.region)    row("Region",   chalk.white(s.region));
  if (s.city)      row("City",     chalk.white(s.city));
  if (s.asn)       row("ASN",      chalk.white(`ASN${s.asn}`));
  if (s.sessTime)  row("Sess. Time", chalk.white(`${s.sessTime} min`));
  row("Saved At",        chalk.dim(s.createdAt.slice(0, 10)));
  if (s.lastIp)    row("Last IP",    chalk.green(s.lastIp) + chalk.dim(`  (${s.lastTested?.slice(0, 10) ?? ""})`));

  console.log(`\n  ${chalk.dim("Proxy URL:")}`);
  console.log(chalk.green(`  ${buildProxyUrl(s)}`));

  console.log(`\n  ${chalk.dim("Test with cURL:")}`);
  console.log(chalk.dim(`  $ ${buildCurlCommand(s)}`));

  console.log(sep + "\n");
}

// ── IP info block ──────────────────────────────────────────────────────────────
export function printIpInfo(info: Record<string, unknown>): void {
  const sep = chalk.gray("─".repeat(62));
  console.log(`\n  ${chalk.dim("Live IP info:")}`);
  console.log(sep);
  const keys = ["query", "country", "regionName", "city", "isp", "org", "as", "status"];
  for (const k of keys) {
    if (info[k] !== undefined) {
      console.log(`  ${chalk.dim(k.padEnd(14))} ${chalk.white(String(info[k]))}`);
    }
  }
  console.log(sep + "\n");
}

// ── Header ─────────────────────────────────────────────────────────────────────
// ── Cities list ────────────────────────────────────────────────────────────────
// One row per city, region repeated, so each line stands alone when grepped.
// Slugs match the names lowercased with punctuation stripped, so they are shown
// only on the rare row where that does not hold.
export function printCitiesList(
  groups: Array<{ region: Region; cities: City[] }>
): void {
  const slug = (v: string) =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const label = (name: string, value: string) =>
    slug(name) === value ? name : `${name} (${value})`;

  const rows = groups.flatMap((g) =>
    g.cities.map((c) => ({
      region: label(g.region.name, g.region.value),
      city: label(c.name, c.value),
    }))
  );
  const width = Math.max(6, ...rows.map((r) => r.region.length)) + 3;

  console.log(chalk.cyan(`  ${"Region".padEnd(width)}City`));
  for (const r of rows) {
    console.log(`  ${chalk.white(r.region.padEnd(width))}${chalk.white(r.city)}`);
  }
}

// ── Flag explanation table (anyip generate) ────────────────────────────────────
// Plain aligned columns rather than a framed table — the "why" column wraps to
// the terminal, and a box would push it down to a couple of words per line.
export function printFlagTable(
  rows: Array<{ flag: string; value: string; why: string }>,
  indent = "     "
): void {
  if (rows.length === 0) return;

  // Cap VALUE: one row listing four ASNs or regions must not squeeze WHY into
  // a two-word column for every other row.
  const flagW = Math.max(4, ...rows.map((r) => r.flag.length)) + 2;
  const valueW = Math.min(Math.max(5, ...rows.map((r) => r.value.length)), 26) + 2;
  const room = (process.stdout.columns ?? 100) - indent.length - flagW - valueW;
  const whyW = Math.max(30, Math.min(room, 70));

  const wrap = (text: string, width: number): string[] => {
    const out: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
    return out;
  };

  console.log(
    indent + chalk.cyan("FLAG".padEnd(flagW) + "VALUE".padEnd(valueW) + "WHY IT IS THERE")
  );
  for (const r of rows) {
    const values = wrap(r.value, valueW - 2);
    const whys = wrap(r.why, whyW);
    for (let i = 0; i < Math.max(values.length, whys.length); i++) {
      console.log(
        indent +
          chalk.yellow((i === 0 ? r.flag : "").padEnd(flagW)) +
          chalk.white((values[i] ?? "").padEnd(valueW)) +
          chalk.dim(whys[i] ?? "")
      );
    }
  }
}

export function printHeader(title: string): void {
  console.log();
  console.log(chalk.bold.cyan(`  ⬡  anyIP CLI  `) + chalk.dim(`— ${title}`));
  console.log();
}

export function success(msg: string): void {
  console.log(chalk.green(`✓  ${msg}`));
}

export function error(msg: string): void {
  console.error(chalk.red(`✗  ${msg}`));
}

export function info(msg: string): void {
  console.log(chalk.cyan(`ℹ  ${msg}`));
}
