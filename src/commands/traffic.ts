import { Command } from "commander";
import * as fs from "fs";
import ora from "ora";
import * as api from "../api.js";
import * as display from "../display.js";
import { getAnyipKey } from "../config.js";

export function registerTrafficCommands(program: Command): void {
  const traffic = program.command("traffic").description("Traffic & usage data");

  traffic
    .command("list")
    .alias("ls")
    .description("List traffic entries grouped by day")
    .option("--proxy <id>", "Filter by proxy account ID")
    .option("--from <date>", "Start date inclusive (YYYY-MM-DD)")
    .option("--to <date>", "End date inclusive (YYYY-MM-DD)")
    .option("--json", "Output raw JSON")
    .action(async (opts: { proxy?: string; from?: string; to?: string; json?: boolean }) => {
      const anyipKey = getAnyipKey();
      const spinner = ora("Fetching traffic…").start();
      try {
        const params: Parameters<typeof api.listTraffic>[1] = {};
        if (opts.proxy) params["proxy_account"] = opts.proxy;
        if (opts.from)  params["date[after]"]   = opts.from;
        if (opts.to)    params["date[before]"]  = opts.to;
        const { members, total } = await api.listTraffic(anyipKey, params);
        spinner.stop();
        if (opts.json) {
          console.log(JSON.stringify(members, null, 2));
          return;
        }
        display.printHeader(`Traffic (${total} days)`);
        if (members.length === 0) {
          display.info("No traffic data for the selected range.");
          return;
        }
        display.printTrafficTable(members);
      } catch (e) {
        spinner.fail(String(e));
      }
    });

  traffic
    .command("export")
    .description("Export traffic data to CSV")
    .option("-o, --output <file>", "Output file (default: stdout)")
    .option("--from <date>", "Start date (YYYY-MM-DD)")
    .option("--to <date>", "End date (YYYY-MM-DD)")
    .option("--proxy <id>", "Filter by proxy account ID")
    .action(async (opts: { output?: string; from?: string; to?: string; proxy?: string }) => {
      const anyipKey = getAnyipKey();
      const spinner = ora("Exporting traffic…").start();
      try {
        const params: Parameters<typeof api.exportTrafficCsv>[1] = {};
        if (opts.from)  params["date[after]"]  = opts.from;
        if (opts.to)    params["date[before]"] = opts.to;
        if (opts.proxy) params["proxy_account"] = opts.proxy;
        const csv = await api.exportTrafficCsv(anyipKey, params);
        spinner.stop();
        if (opts.output) {
          fs.writeFileSync(opts.output, csv, "utf-8");
          display.success(`Exported to ${opts.output}`);
        } else {
          process.stdout.write(csv);
        }
      } catch (e) {
        spinner.fail(String(e));
      }
    });
}
