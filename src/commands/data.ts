import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as api from "../api.js";
import * as display from "../display.js";
import { getAnyipKey } from "../config.js";

export function registerDataCommands(program: Command): void {
  const data = program.command("data").description("Geographic & ISP reference data");

  data
    .command("countries")
    .description("List available countries")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      const anyipKey = getAnyipKey();
      const spinner = ora("Loading countries…").start();
      try {
        const countries = await api.getCountries(anyipKey);
        spinner.stop();
        if (opts.json) {
          console.log(JSON.stringify(countries, null, 2));
          return;
        }
        display.printHeader("Available Countries");
        const rows = countries.map(
          (c) => `  ${chalk.yellow(c.value.padEnd(6))} ${chalk.white(c.name)}`
        );
        console.log(rows.join("\n"));
        console.log(chalk.dim(`\n  ${countries.length} countries available\n`));
      } catch (e) {
        spinner.fail(String(e));
      }
    });

  data
    .command("regions <country>")
    .description("List available regions for a country code (e.g. US)")
    .option("--json", "Output raw JSON")
    .action(async (country: string, opts: { json?: boolean }) => {
      const anyipKey = getAnyipKey();
      const code = country.toUpperCase();
      const spinner = ora(`Loading regions for ${code}…`).start();
      try {
        const regions = await api.getRegions(anyipKey, code);
        spinner.stop();
        if (opts.json) {
          console.log(JSON.stringify(regions, null, 2));
          return;
        }
        display.printHeader(`Regions — ${code}`);
        regions.forEach((r) => {
          console.log(`  ${chalk.yellow(r.value.padEnd(22))} ${chalk.white(r.name)}`);
        });
        console.log();
      } catch (e) {
        spinner.fail(String(e));
      }
    });

  data
    .command("asn <country>")
    .description("List ISP/carrier ASNs for a country (e.g. US)")
    .option("--json", "Output raw JSON")
    .action(async (country: string, opts: { json?: boolean }) => {
      const anyipKey = getAnyipKey();
      const code = country.toUpperCase();
      const spinner = ora(`Loading ASNs for ${code}…`).start();
      try {
        const asns = await api.getAsn(anyipKey, code);
        spinner.stop();
        if (opts.json) {
          console.log(JSON.stringify(asns, null, 2));
          return;
        }
        display.printHeader(`ASNs — ${code}`);
        asns.forEach((a) => {
          console.log(`  ${chalk.yellow(`ASN${a.value}`.padEnd(12))} ${chalk.white(a.name)}`);
        });
        console.log();
      } catch (e) {
        spinner.fail(String(e));
      }
    });
}
