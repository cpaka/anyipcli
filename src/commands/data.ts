import { Command, Option } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as api from "../api.js";
import * as display from "../display.js";
import { getAnyipKey } from "../config.js";

// Region slugs are lowercase and stripped of spaces/punctuation ("New York" →
// "newyork"), so accept either the display name or the slug from the user.
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Run tasks with a bounded number in flight — a country can have 45+ regions.
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function registerDataCommands(program: Command): void {
  program
    .command("country")
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

  program
    .command("region <country>")
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

  program
    .command("city <country> [region]")
    .description("List available cities for a region, or for a whole country (e.g. US california)")
    .option("--json", "Output raw JSON")
    .option(
      "--tags",
      "Output proxy username flags: country_<CC>,region_<region>,city_<city>"
    )
    .addOption(new Option("--flag", "Alias of --tags").hideHelp())
    .action(async (
      country: string,
      region: string | undefined,
      opts: { json?: boolean; tags?: boolean; flag?: boolean }
    ) => {
      const anyipKey = getAnyipKey();
      const code = country.toUpperCase();
      const wantTags = !!(opts.tags || opts.flag);
      const spinner = ora(`Loading regions for ${code}…`).start();
      try {
        const regions = await api.getRegions(anyipKey, code);
        if (regions.length === 0) {
          spinner.fail(`No regions available for ${code}`);
          return;
        }

        let targets = regions;
        if (region) {
          const wanted = slugify(region);
          const match = regions.find(
            (r) => slugify(r.value) === wanted || slugify(r.name) === wanted
          );
          if (!match) {
            spinner.fail(`Unknown region "${region}" for ${code}`);
            console.log(
              chalk.dim(`\n  Run ${chalk.white(`anyip region ${code}`)} to list valid regions.\n`)
            );
            process.exitCode = 1;
            return;
          }
          targets = [match];
        }

        spinner.text =
          targets.length === 1
            ? `Loading cities for ${targets[0].name}…`
            : `Loading cities for ${targets.length} regions in ${code}…`;

        // A failed region must not look like an empty one, or the totals lie.
        const groups = await mapLimit(targets, 8, async (r) => {
          try {
            return { region: r, cities: await api.getCities(anyipKey, code, r.value) };
          } catch (e) {
            return { region: r, cities: [] as api.City[], error: String(e) };
          }
        });
        spinner.stop();

        const failed = groups.filter((g) => g.error);
        const found = groups.filter((g) => g.cities.length > 0);
        const total = found.reduce((n, g) => n + g.cities.length, 0);

        // Username flag segments, ready to paste into a proxy username. The
        // country comes first because region/city are only honoured when the
        // country is set — a bare region_/city_ pair is ignored upstream.
        const tag = (regionValue: string, cityValue: string) =>
          `country_${code},region_${regionValue},city_${cityValue}`;

        if (opts.json) {
          console.log(
            JSON.stringify(
              found.flatMap((g) =>
                g.cities.map((c) => ({
                  ...c,
                  region: g.region.value,
                  ...(wantTags ? { tag: tag(g.region.value, c.value) } : {}),
                }))
              ),
              null,
              2
            )
          );
          return;
        }

        if (wantTags) {
          found.forEach((g) => {
            g.cities.forEach((c) => console.log(tag(g.region.value, c.value)));
          });
          return;
        }

        display.printHeader(
          region ? `Cities — ${code} / ${targets[0].name}` : `Cities — ${code}`
        );

        if (total === 0) {
          console.log(
            failed.length === targets.length
              ? chalk.yellow(`  Could not load any region — ${failed[0].error}\n`)
              : chalk.dim("  No cities available\n")
          );
          return;
        }

        display.printCitiesList(found);
        console.log(
          chalk.dim(
            `\n  ${total} ${total === 1 ? "city" : "cities"}` +
              (region ? "" : ` across ${found.length} of ${regions.length} regions`) +
              " — pass the lowercase form, e.g. --region texas --city dallas"
          )
        );
        if (failed.length > 0) {
          console.log(
            chalk.yellow(
              `  ${failed.length} region(s) failed to load: ` +
                failed.map((g) => g.region.value).join(", ")
            )
          );
        }
        console.log();
      } catch (e) {
        spinner.fail(String(e));
      }
    });

  program
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
