import { Command } from "commander";
import { spawnSync } from "child_process";
import chalk from "chalk";
import ora from "ora";
import * as fs from "fs";
import * as api from "../api.js";
import * as display from "../display.js";
import * as sessions from "../sessions.js";
import { getAnyipKey } from "../config.js";
import { ask } from "../utils.js";

// ── get — find / create / test a session ──────────────────────────────────────

export function registerGetCommand(program: Command): void {
  program
    .command("get")
    .description("Find (or create) a proxy matching the given filters, test it with curl")
    .option("-m, --mobile",            "Network type: mobile")
    .option("-r, --residential",       "Network type: residential")
    .option("-l, --location <query>",  "Country code, city, region, or ASN (case-insensitive)")
    .option("--socks5",                "Connection type: SOCKS5 (port 1080, default)")
    .option("--http",                  "Connection type: HTTP (port 8080)")
    .option("-n, --name <query>",      "Match saved session name")
    .option("-u, --user <n>",          "Use proxy account #N from `anyip account` (1-based)")
    .option("--rotating",              "New IP per connection (no sticky session)")
    .option("-t, --time <minutes>",    "Session duration in minutes (1–10080)")
    .option("--list",                  "Just list matches, don't run curl")
    .action(async (opts: {
      mobile?: boolean; residential?: boolean; location?: string;
      socks5?: boolean; http?: boolean; name?: string; user?: string;
      rotating?: boolean; time?: string; list?: boolean;
    }) => {
      let results = sessions.listSessions();

      if (opts.mobile)      results = results.filter(s => s.networkType === "mobile");
      if (opts.residential) results = results.filter(s => s.networkType === "residential");
      if (opts.socks5)      results = results.filter(s => s.connectionType === "socks5");
      if (opts.http)        results = results.filter(s => s.connectionType === "http");
      if (opts.rotating)    results = results.filter(s => s.rotating === true);
      if (opts.time)        results = results.filter(s => s.sessTime === parseInt(opts.time!, 10));
      if (!opts.rotating && !opts.time) results = results.filter(s => !s.rotating);
      if (opts.name) {
        const q = opts.name.toLowerCase();
        results = results.filter(s => s.name.toLowerCase().includes(q));
      }
      if (opts.location) {
        const q = opts.location.toLowerCase();
        results = results.filter(s =>
          [s.country, s.region, s.city, s.asn && `asn${s.asn}`].some(v => v?.toLowerCase().includes(q))
        );
      }

      const filterLabel = [
        opts.mobile && "mobile", opts.residential && "residential",
        opts.socks5 && "socks5", opts.http && "http", opts.rotating && "rotating",
        opts.time && `sesstime:${opts.time}min`, opts.location && `location:"${opts.location}"`,
        opts.name && `name:"${opts.name}"`,
      ].filter(Boolean).join(", ");

      if (opts.list) {
        display.printHeader(`Proxies${filterLabel ? ` — ${filterLabel}` : ""} (${results.length})`);
        if (results.length === 0) {
          display.info("No proxies match those filters.");
        } else {
          display.printSessionsTable(results);
          console.log();
        }
        return;
      }

      let session: sessions.ProxySession;

      if (results.length === 0) {
        const anyipKey = getAnyipKey();
        const networkType = opts.residential ? "residential" : "mobile";
        const connectionType = opts.http ? "http" : "socks5";
        const port = opts.http ? 8080 : 1080;

        let country: string | undefined;
        let city: string | undefined;
        if (opts.location) {
          const loc = opts.location.trim();
          if (loc.length === 2) country = loc.toUpperCase();
          else city = loc.toLowerCase();
        }

        const fetchSpinner = ora("Loading proxy accounts…").start();
        let proxyList: api.ProxyAccount[];
        try {
          const { members } = await api.listProxies(anyipKey, { itemsPerPage: "100" });
          proxyList = members;
          fetchSpinner.stop();
        } catch (e) {
          fetchSpinner.fail(String(e));
          process.exit(1);
        }

        if (proxyList.length === 0) {
          display.error("No proxy accounts found. Create one with: anyip account create");
          process.exit(1);
        }

        let accountIndex = 0;
        if (opts.user) {
          const n = parseInt(opts.user, 10);
          if (isNaN(n) || n < 1 || n > proxyList.length) {
            display.error(`--user must be between 1 and ${proxyList.length}. Run: anyip account list`);
            process.exit(1);
          }
          accountIndex = n - 1;
        }

        const chosen = proxyList[accountIndex];
        const detailSpinner = ora(`Fetching credentials for user_${chosen.username}…`).start();
        let fullProxy: api.ProxyAccount;
        try {
          fullProxy = await api.getProxy(anyipKey, chosen.id);
          detailSpinner.stop();
        } catch (e) {
          detailSpinner.fail(String(e));
          process.exit(1);
        }

        if (!fullProxy.password) {
          display.error("Password not available — recreate the proxy account via the dashboard.");
          process.exit(1);
        }

        const isRotating = !!opts.rotating;
        const sessTimeVal = opts.time ? parseInt(opts.time, 10) : undefined;
        if (sessTimeVal !== undefined && (sessTimeVal < 1 || sessTimeVal > 10080)) {
          display.error("--time must be between 1 and 10080 minutes.");
          process.exit(1);
        }

        const sessionName = isRotating ? undefined : Math.random().toString(16).slice(2, 10);
        const userParts = [
          `user_${fullProxy.username}`,
          `type_${networkType}`,
          country    && `country_${country}`,
          city       && `city_${city}`,
          sessionName && `session_${sessionName}`,
          sessTimeVal  && `sesstime_${sessTimeVal}`,
        ].filter(Boolean).join(",");

        const storedName = isRotating
          ? `rotating_${Math.random().toString(16).slice(2, 10)}`
          : `session_${sessionName}`;

        session = {
          name: storedName,
          networkType,
          connectionType,
          server: "portal.anyip.io",
          port,
          username: userParts,
          password: fullProxy.password,
          country,
          city,
          sessTime: sessTimeVal,
          rotating: isRotating,
          createdAt: new Date().toISOString(),
          userTag: fullProxy.username ?? undefined,
        };
        sessions.saveSession(session);
        display.success(
          `Session "${storedName}" created for user_${fullProxy.username}` +
          (isRotating ? " (rotating)" : "") +
          (sessTimeVal ? ` (sesstime: ${sessTimeVal}min)` : "")
        );
      } else {
        session = results[0];
        if (results.length > 1) {
          display.info(`${results.length} proxies match — testing the first: "${session.name}"`);
        }
      }

      const scheme = session.connectionType === "socks5" ? "socks5" : "http";
      const proxyUrl = sessions.buildProxyUrl(session, scheme);
      console.log(chalk.dim(`\n  $ curl -s -x "${session.connectionType}://${session.server}:${session.port}" http://ip-api.com/json/`));

      const spinner = ora("Testing proxy…").start();
      // Use spawnSync with an args array to avoid shell injection
      const result = spawnSync("curl", ["-s", "-x", proxyUrl, "http://ip-api.com/json/"], {
        timeout: 15000,
        encoding: "utf8",
      });

      if (result.error || result.status !== 0) {
        spinner.fail(`curl failed: ${result.error?.message ?? result.stderr ?? "unknown error"}`);
        display.printSessionCard(session);
        return;
      }

      spinner.stop();
      try {
        const ipInfo = JSON.parse(result.stdout) as Record<string, unknown>;
        session.lastIp = String(ipInfo.query ?? "");
        session.lastTested = new Date().toISOString();
        sessions.saveSession(session);
        display.printSessionCard(session);
        display.printIpInfo(ipInfo);
      } catch {
        console.log(result.stdout);
        display.printSessionCard(session);
      }
    });
}

// ── proxy — manage saved sessions ─────────────────────────────────────────────

export function registerProxyCommands(program: Command): void {
  const proxyCmd = program.command("proxy").description("Manage locally saved proxy sessions");

  proxyCmd
    .command("list")
    .alias("ls")
    .description("List all saved proxy sessions")
    .option("-u, --user <query>", "Filter by user index (1, 2…) or username substring")
    .option("-q, --search <text>", "Filter by session name, country, city, region or tag")
    .option("--network <type>", "Only residential or mobile")
    .option("--session <type>", "Only sticky or rotating")
    .option(
      "--format <fmt>",
      "Proxy string format: hostuser | userhost | http | https | socks5",
      "hostuser"
    )
    .option("--json", "Output raw JSON")
    .action(async (opts: {
      user?: string;
      search?: string;
      network?: string;
      session?: string;
      format?: string;
      json?: boolean;
    }) => {
      let all = sessions.listSessions();
      let userLabel = opts.user;

      if (opts.user) {
        const n = parseInt(opts.user, 10);
        if (!isNaN(n)) {
          const anyipKey = getAnyipKey();
          try {
            const { members } = await api.listProxies(anyipKey, { itemsPerPage: "100" });
            if (n < 1 || n > members.length) {
              display.error(`--user must be between 1 and ${members.length}. Run: anyip account list`);
              process.exit(1);
            }
            const tag = members[n - 1].username ?? "";
            userLabel = `user_${tag}`;
            all = all.filter(s => sessions.resolveUserTag(s) === tag);
          } catch (e) {
            display.error(`Could not fetch accounts: ${String(e)}`);
            process.exit(1);
          }
        } else {
          const q = opts.user.toLowerCase();
          all = all.filter(s => sessions.resolveUserTag(s).toLowerCase().includes(q));
        }
      }

      // Same filters as the dashboard's Proxies tab.
      if (opts.network) {
        const want = opts.network.toLowerCase();
        all = all.filter((s) => s.networkType?.toLowerCase() === want);
      }
      if (opts.session) {
        const want = opts.session.toLowerCase();
        if (want === "sticky") all = all.filter((s) => !s.rotating);
        if (want === "rotating") all = all.filter((s) => s.rotating);
      }
      if (opts.search) {
        const q = opts.search.toLowerCase();
        all = all.filter((s) =>
          [s.name, s.country, s.region, s.city, s.pool, s.asn, s.userTag, s.networkType, s.connectionType]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        );
      }

      const format = (opts.format ?? "hostuser") as sessions.ProxyFormat;
      const FORMATS = ["hostuser", "userhost", "http", "https", "socks5"];
      if (!FORMATS.includes(format)) {
        display.error(`--format must be one of ${FORMATS.join(", ")}`);
        process.exit(1);
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            all.map((s) => ({ ...s, proxy: sessions.buildProxyString(s, format) })),
            null,
            2
          )
        );
        return;
      }

      const filters = [
        opts.user && `user:${userLabel}`,
        opts.network && `network:${opts.network}`,
        opts.session && `session:${opts.session}`,
        opts.search && `search:"${opts.search}"`,
      ].filter(Boolean).join(", ");

      display.printHeader(
        `Saved Proxies (${all.length})${filters ? ` — ${filters}` : ""}`
      );
      if (all.length === 0) {
        display.info("No sessions found. Use: anyip get");
        return;
      }
      display.printSessionsTable(all, format);
      console.log();
    });

  proxyCmd
    .command("add <connection-string>")
    .description("Save a proxy session from a connection string (server:port:username:password)")
    .option("-n, --name <name>", "Override the session name")
    .action((connStr: string, opts: { name?: string }) => {
      try {
        const session = sessions.parseConnectionString(connStr);
        if (opts.name) session.name = opts.name;
        sessions.saveSession(session);
        display.success(`Session "${session.name}" saved`);
        display.printSessionCard(session);
      } catch (e) {
        display.error(String(e));
        process.exit(1);
      }
    });

  proxyCmd
    .command("import <file>")
    .description("Bulk-import sessions from a file (one connection string per line)")
    .action((filePath: string) => {
      if (!fs.existsSync(filePath)) {
        display.error(`File not found: ${filePath}`);
        process.exit(1);
      }
      const lines = fs.readFileSync(filePath, "utf-8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));

      let saved = 0;
      let failed = 0;
      for (const line of lines) {
        try {
          sessions.saveSession(sessions.parseConnectionString(line));
          saved++;
        } catch {
          display.error(`Skipped invalid line: ${line}`);
          failed++;
        }
      }
      display.success(`Imported ${saved} session(s)${failed ? ` (${failed} skipped)` : ""}`);
      console.log();
    });

  proxyCmd
    .command("get <name>")
    .alias("show")
    .description("Show full details for a saved session")
    .action((name: string) => {
      const session = sessions.getSession(name);
      if (!session) {
        display.error(`Session "${name}" not found. Run: anyip proxy list`);
        process.exit(1);
      }
      display.printSessionCard(session);
    });

  proxyCmd
    .command("curl <name>")
    .description("Print the curl test command for a saved session")
    .option("--run", "Execute the curl command instead of just printing it")
    .action((name: string, opts: { run?: boolean }) => {
      const session = sessions.getSession(name);
      if (!session) {
        display.error(`Session "${name}" not found. Run: anyip proxy list`);
        process.exit(1);
      }
      const proxyUrl = sessions.buildProxyUrl(session);
      const printCmd = sessions.buildCurlCommand(session);

      if (opts.run) {
        console.log(chalk.dim(`\n  $ ${printCmd}\n`));
        // Use spawnSync with arg array — avoids shell injection from proxy credentials
        const result = spawnSync(
          "curl",
          ["-s", "--proxy", `${session.server}:${session.port}`, "--proxy-user", `${session.username}:${session.password}`, "http://ip-api.com/json/"],
          { timeout: 15000, encoding: "utf8" }
        );
        if (result.error) {
          display.error(`curl failed: ${result.error.message}`);
          return;
        }
        try {
          const json = JSON.parse(result.stdout);
          console.log(chalk.bold("  IP Info:"));
          Object.entries(json).forEach(([k, v]) =>
            console.log(`  ${chalk.dim(k.padEnd(14))} ${chalk.white(String(v))}`)
          );
        } catch {
          console.log(result.stdout);
        }
      } else {
        console.log(`\n  ${chalk.dim("# Copy this in your terminal")}`);
        console.log(chalk.green(`  $ ${printCmd}\n`));
      }
    });

  proxyCmd
    .command("delete <name>")
    .alias("rm")
    .description("Delete a saved session")
    .action((name: string) => {
      if (!sessions.deleteSession(name)) {
        display.error(`Session "${name}" not found`);
        process.exit(1);
      }
      display.success(`Session "${name}" deleted`);
    });

  proxyCmd
    .command("clear")
    .description("Delete all saved sessions")
    .action(async () => {
      const all = sessions.listSessions();
      if (all.length === 0) {
        display.info("No sessions to clear");
        return;
      }
      const confirm = await ask(`  Delete all ${all.length} session(s)? [y/N] `);
      if (confirm.trim().toLowerCase() !== "y") {
        display.info("Aborted.");
        return;
      }
      sessions.clearSessions();
      display.success("All sessions cleared");
    });
}
