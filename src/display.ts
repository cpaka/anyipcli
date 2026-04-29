import chalk from "chalk";
import Table from "cli-table3";
import type { ProxyAccount, User, Traffic } from "./api.js";
import type { ProxySession } from "./sessions.js";
import { buildCurlCommand, buildProxyUrl, resolveUserTag } from "./sessions.js";

// ── Bytes formatter ────────────────────────────────────────────────────────────
export function fmtBytes(bytes?: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(2)} ${units[i]}`;
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
      fmtBytes(p.consumption),
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
      fmtBytes(p.quota),
      fmtBytes(p.consumption),
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
  row("Quota", fmtBytes(p.quota));
  row("Used", fmtBytes(p.consumption));
  row("Recv / Sent", `${fmtBytes(p.bytes_recv)} / ${fmtBytes(p.bytes_sent)}`);

  if (p.ip_whitelist?.ports?.length) {
    console.log(`\n  ${chalk.dim("Ports:")}`);
    for (const port of p.ip_whitelist.ports) {
      const parts = [
        port.port && chalk.yellow(`:${port.port}`),
        port.type && chalk.cyan(port.type),
        port.country && `country=${chalk.white(port.country)}`,
        port.city && `city=${chalk.white(port.city)}`,
        port.session && `session=${chalk.white(port.session)}`,
        port.sess_time && `sesstime=${port.sess_time}min`,
      ].filter(Boolean);
      console.log(`    ${parts.join("  ")}`);
    }
  }

  if (p.ip_whitelist?.ips?.length) {
    console.log(`\n  ${chalk.dim("Whitelisted IPs:")} ${p.ip_whitelist.ips.join(", ")}`);
  }

  // Proxy URL
  if (p.username && p.plain_password) {
    console.log(`\n  ${chalk.dim("Proxy URL:")}`);
    console.log(
      chalk.green(
        `  http://${p.username}:${p.plain_password}@gate.anyip.io:8080`
      )
    );
  }
  console.log(sep + "\n");
}

// ── User card ──────────────────────────────────────────────────────────────────
export function printUserCard(u: User): void {
  const sep = chalk.gray("─".repeat(52));
  console.log(`\n${sep}`);
  console.log(chalk.bold.cyan("  Account Info"));
  console.log(sep);
  const row = (label: string, val: string) =>
    console.log(`  ${chalk.dim(label.padEnd(20))} ${val}`);
  row("Email", chalk.white(u.email ?? "—"));
  row("Username", chalk.yellow(u.username ?? "—"));
  row("Quota", fmtBytes(u.quota));
  row("Used", fmtBytes(u.consumption));
  console.log(sep + "\n");
}

// ── Traffic table ──────────────────────────────────────────────────────────────
export function printTrafficTable(items: Traffic[]): void {
  const table = new Table({
    head: [chalk.cyan("Date"), chalk.cyan("Consumed"), chalk.cyan("Requests")],
    style: { head: [], border: ["gray"] },
    colWidths: [14, 16, 12],
    wordWrap: true,
  });
  for (const t of items) {
    const date = t._id?.date ?? t.date ?? "—";
    table.push([
      chalk.dim(date),
      fmtBytes(t.total_consumed),
      chalk.white(String(t.nb_requests ?? 0)),
    ]);
  }
  console.log(table.toString());
}

// ── Sessions table ─────────────────────────────────────────────────────────────
export function printSessionsTable(sessions: ProxySession[]): void {
  const table = new Table({
    head: [
      chalk.cyan("#"),
      chalk.cyan("User"),
      chalk.cyan("Session Name"),
      chalk.cyan("Type"),
      chalk.cyan("Location"),
      chalk.cyan("Last IP"),
      chalk.cyan("Saved"),
    ],
    style: { head: [], border: ["gray"] },
    colWidths: [4, 14, 24, 12, 28, 18, 12],
    wordWrap: true,
  });

  sessions.forEach((s, i) => {
    const location = [
      s.country,
      s.region,
      s.city,
      s.asn && `ASN${s.asn}`,
    ].filter(Boolean).join(", ") || "—";

    table.push([
      chalk.dim(String(i + 1)),
      chalk.yellow(`user_${resolveUserTag(s)}`),
      chalk.white(s.name),
      s.rotating ? chalk.magenta("rotating") : chalk.cyan(s.networkType),
      chalk.dim(location),
      s.lastIp ? chalk.green(s.lastIp) : chalk.dim("—"),
      chalk.dim(s.createdAt.slice(0, 10)),
    ]);
  });

  console.log(table.toString());
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
