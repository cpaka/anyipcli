import { Command } from "commander";
import * as fs from "fs";
import ora from "ora";
import * as api from "../api.js";
import * as display from "../display.js";
import { getAnyipKey } from "../config.js";

// The v1 traffic endpoint requires an explicit date range — default to the
// last 30 days.
function resolveRange(opts: { from?: string; to?: string }): { after: string; before: string } {
  const before = opts.to ?? new Date().toISOString().slice(0, 10);
  const after =
    opts.from ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { after, before };
}

export function registerTrafficCommands(program: Command): void {
  const traffic = program.command("traffic").description("Traffic & usage data");

  traffic
    .command("list")
    .alias("ls")
    .description("Show the traffic time series (default: last 30 days, daily)")
    .option("--proxy <id...>", "Filter by proxy account ID (repeatable)")
    .option("--from <date>", "Start date inclusive (YYYY-MM-DD)")
    .option("--to <date>", "End date inclusive (YYYY-MM-DD)")
    .option("--interval <interval>", "Aggregation interval: hourly | daily", "daily")
    .option("--json", "Output raw JSON")
    .action(async (opts: {
      proxy?: string[]; from?: string; to?: string;
      interval: string; json?: boolean;
    }) => {
      const anyipKey = getAnyipKey();
      if (opts.interval !== "hourly" && opts.interval !== "daily") {
        display.error("--interval must be 'hourly' or 'daily'");
        process.exit(1);
      }
      const { after, before } = resolveRange(opts);
      const spinner = ora("Fetching traffic…").start();
      try {
        const points = await api.getTraffic(anyipKey, {
          "date[after]": after,
          "date[before]": before,
          interval: opts.interval,
          proxyAccounts: opts.proxy,
        });
        spinner.stop();
        if (opts.json) {
          console.log(JSON.stringify(points, null, 2));
          return;
        }
        display.printHeader(`Traffic ${after} → ${before} (${opts.interval})`);
        if (points.length === 0) {
          display.info("No traffic data for the selected range.");
          return;
        }
        display.printTrafficTable(points);
        const total = points.reduce((sum, p) => sum + p.bytes_sent + p.bytes_recv, 0);
        display.info(`Total: ${display.fmtBytes(total)}`);
        console.log();
      } catch (e) {
        spinner.fail(String(e));
      }
    });

  traffic
    .command("export")
    .description("Export the traffic time series to CSV")
    .option("-o, --output <file>", "Output file (default: stdout)")
    .option("--from <date>", "Start date (YYYY-MM-DD)")
    .option("--to <date>", "End date (YYYY-MM-DD)")
    .option("--interval <interval>", "Aggregation interval: hourly | daily", "daily")
    .option("--proxy <id...>", "Filter by proxy account ID (repeatable)")
    .action(async (opts: {
      output?: string; from?: string; to?: string;
      interval: string; proxy?: string[];
    }) => {
      const anyipKey = getAnyipKey();
      if (opts.interval !== "hourly" && opts.interval !== "daily") {
        display.error("--interval must be 'hourly' or 'daily'");
        process.exit(1);
      }
      const { after, before } = resolveRange(opts);
      const spinner = ora("Exporting traffic…").start();
      try {
        const points = await api.getTraffic(anyipKey, {
          "date[after]": after,
          "date[before]": before,
          interval: opts.interval,
          proxyAccounts: opts.proxy,
        });
        const csv = api.trafficToCsv(points);
        spinner.stop();
        if (opts.output) {
          fs.writeFileSync(opts.output, csv, "utf-8");
          display.success(`Exported ${points.length} row(s) to ${opts.output}`);
        } else {
          process.stdout.write(csv);
        }
      } catch (e) {
        spinner.fail(String(e));
      }
    });

  traffic
    .command("usage")
    .description("Show team quota usage (or one proxy account's with --proxy)")
    .option("--proxy <id>", "Show usage for a single proxy account")
    .option("--json", "Output raw JSON")
    .action(async (opts: { proxy?: string; json?: boolean }) => {
      const anyipKey = getAnyipKey();
      const spinner = ora("Fetching usage…").start();
      try {
        const usage = opts.proxy
          ? await api.getProxyUsage(anyipKey, opts.proxy)
          : await api.getTeamUsage(anyipKey);
        spinner.stop();
        if (opts.json) {
          console.log(JSON.stringify(usage, null, 2));
          return;
        }
        display.printHeader(opts.proxy ? `Usage — account ${opts.proxy}` : "Team Usage");
        console.log(`  Quota       ${display.fmtBytes(usage.quota_bytes)}`);
        console.log(`  Used        ${display.fmtBytes(usage.consumption_bytes)}`);
        console.log(`  Remaining   ${display.fmtBytes(usage.remaining_bytes)}`);
        if (!opts.proxy) {
          console.log(`  Accounts    ${usage.proxy_accounts_used} / ${usage.proxy_account_quota}`);
        }
        if (usage.period?.from) {
          console.log(`  Period      ${usage.period.from.slice(0, 10)} → ${usage.period.to?.slice(0, 10) ?? "…"}`);
        }
        console.log();
      } catch (e) {
        spinner.fail(String(e));
      }
    });
}
