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

// `--tags` and `--flag` are the same switch on every data command: print the
// proxy username segments instead of the human listing, one self-contained
// line each so the output pipes straight into a username.
interface TagOpts {
  tags?: boolean;
  flag?: boolean;
}

function wantsTags(opts: TagOpts): boolean {
  return !!(opts.tags || opts.flag);
}

function withTags(cmd: Command, description: string): Command {
  return cmd
    .option("--tags", description)
    .addOption(new Option("--flag", "Alias of --tags").hideHelp());
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


// ── Geocoding ─────────────────────────────────────────────────────────────────
// anyIP has no place lookup of its own, so `near` resolves coordinates through
// public geocoders (same class of third-party call as the ip-api.com lookup
// `anyip check` already makes). Open-Meteo answers first — fast, key-less and
// clean for cities — and OpenStreetMap's Nominatim covers what it does not
// index at all: landmarks, streets, venues ("Eiffel Tower").
const OPEN_METEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "anyip-cli (https://github.com/cpaka/anyipcli)";

interface Place {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  admin2?: string;
  population?: number;
  timezone?: string;
  source?: "open-meteo" | "nominatim";
}

// Five decimals is ~1 m — past the point where a proxy peer lookup cares, and
// it keeps the username flag short.
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

async function getJson(url: URL): Promise<unknown> {
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Geocoding failed — HTTP ${res.status} (${url.host})`);
  return res.json();
}

async function geocodeOpenMeteo(query: string, count: number): Promise<Place[]> {
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("name", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const body = (await getJson(url)) as { results?: Place[] };
  return (body.results ?? []).map((p) => ({ ...p, source: "open-meteo" as const }));
}

interface NominatimResult {
  name?: string;
  display_name?: string;
  lat: string;
  lon: string;
  address?: { state?: string; county?: string; country?: string; country_code?: string };
}

async function geocodeNominatim(
  query: string,
  count: number,
  country?: string
): Promise<Place[]> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(count));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");
  if (country) url.searchParams.set("countrycodes", country.toLowerCase());

  const results = (await getJson(url)) as NominatimResult[];
  return results.map((r) => ({
    name: r.name || r.display_name?.split(",")[0] || query,
    latitude: round5(parseFloat(r.lat)),
    longitude: round5(parseFloat(r.lon)),
    admin1: r.address?.state ?? r.address?.county,
    country: r.address?.country,
    country_code: r.address?.country_code?.toUpperCase(),
    source: "nominatim" as const,
  }));
}

// Compare on letters and digits only, so "Île-de-France" matches "iledefrance"
// and "New York" matches "new york".
const normalize = (v: string) =>
  v.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function geocode(query: string, limit: number, country?: string): Promise<Place[]> {
  const inCountry = (p: Place) =>
    !country || p.country_code?.toUpperCase() === country;

  // Always over-fetch: Open-Meteo ranks by population, so both the country
  // filter and the name check below can discard most of a short page.
  const cities = (
    await geocodeOpenMeteo(query, Math.min(Math.max(limit * (country ? 10 : 4), 10), 100))
  ).filter(inCountry);

  // Open-Meteo matches loosely on the first word, so "Statue of Liberty" comes
  // back as the town of Liberty. Trust it only on a real name match; anything
  // else is a landmark/address question and belongs to Nominatim.
  const named = cities.filter((p) => normalize(p.name) === normalize(query));
  if (named.length > 0) return named.slice(0, limit);

  const places = (await geocodeNominatim(query, limit, country)).filter(inCountry);
  return (places.length > 0 ? places : cities).slice(0, limit);
}

export function registerDataCommands(program: Command): void {
  withTags(
    program
      .command("country")
      .description("List available countries")
      .option("--json", "Output raw JSON"),
    "Output proxy username flags: country_<CC>"
  )
    .action(async (opts: { json?: boolean } & TagOpts) => {
      const anyipKey = getAnyipKey();
      const spinner = ora("Loading countries…").start();
      try {
        const countries = await api.getCountries(anyipKey);
        spinner.stop();
        const tag = (c: api.Country) => `country_${c.value.toUpperCase()}`;
        if (opts.json) {
          console.log(
            JSON.stringify(
              countries.map((c) => (wantsTags(opts) ? { ...c, tag: tag(c) } : c)),
              null,
              2
            )
          );
          return;
        }
        if (wantsTags(opts)) {
          countries.forEach((c) => console.log(tag(c)));
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

  withTags(
    program
      .command("region <country>")
      .description("List available regions for a country code (e.g. US)")
      .option("--json", "Output raw JSON"),
    "Output proxy username flags: country_<CC>,region_<region>"
  )
    .action(async (country: string, opts: { json?: boolean } & TagOpts) => {
      const anyipKey = getAnyipKey();
      const code = country.toUpperCase();
      const spinner = ora(`Loading regions for ${code}…`).start();
      try {
        const regions = await api.getRegions(anyipKey, code);
        spinner.stop();
        const tag = (r: api.Region) => `country_${code},region_${r.value}`;
        if (opts.json) {
          console.log(
            JSON.stringify(
              regions.map((r) => (wantsTags(opts) ? { ...r, tag: tag(r) } : r)),
              null,
              2
            )
          );
          return;
        }
        if (wantsTags(opts)) {
          regions.forEach((r) => console.log(tag(r)));
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

  withTags(
    program
      .command("city <country> [region]")
      .description("List available cities for a region, or for a whole country (e.g. US california)")
      .option("--json", "Output raw JSON"),
    "Output proxy username flags: country_<CC>,region_<region>,city_<city>"
  )
    .action(async (
      country: string,
      region: string | undefined,
      opts: { json?: boolean } & TagOpts
    ) => {
      const anyipKey = getAnyipKey();
      const code = country.toUpperCase();
      const wantTags = wantsTags(opts);
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

  withTags(
    program
      .command("asn <country>")
      .description("List ISP/carrier ASNs for a country (e.g. US)")
      .option("--json", "Output raw JSON"),
    "Output proxy username flags: country_<CC>,asn_<asn>"
  )
    .action(async (country: string, opts: { json?: boolean } & TagOpts) => {
      const anyipKey = getAnyipKey();
      const code = country.toUpperCase();
      const spinner = ora(`Loading ASNs for ${code}…`).start();
      try {
        const asns = await api.getAsn(anyipKey, code);
        spinner.stop();
        const tag = (a: api.AsnEntry) => `country_${code},asn_${a.value}`;
        if (opts.json) {
          console.log(
            JSON.stringify(
              asns.map((a) => (wantsTags(opts) ? { ...a, tag: tag(a) } : a)),
              null,
              2
            )
          );
          return;
        }
        if (wantsTags(opts)) {
          asns.forEach((a) => console.log(tag(a)));
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

  withTags(
    program
      .command("near <place...>")
      .description("Look up GPS coordinates for a place — city, address or landmark")
      .option("--country <code>", "Only keep matches in this country code (e.g. FR)")
      .option("-n, --limit <n>", "Maximum matches to show", "5")
      .option("--json", "Output raw JSON"),
    "Output proxy username flags: lat_<lat>,lon_<lon>"
  )
    .action(async (
      placeParts: string[],
      opts: { country?: string; limit?: string; json?: boolean } & TagOpts
    ) => {
      const query = placeParts.join(" ").trim();
      const limit = Math.max(1, Math.min(parseInt(opts.limit ?? "5", 10) || 5, 50));
      const country = opts.country?.toUpperCase();

      const spinner = ora(`Locating "${query}"…`).start();
      let places: Place[];
      try {
        places = await geocode(query, limit, country);
      } catch (e) {
        spinner.fail(String(e));
        process.exitCode = 1;
        return;
      }
      spinner.stop();

      if (places.length === 0) {
        display.error(
          `No place found for "${query}"` + (country ? ` in ${country}` : "")
        );
        process.exitCode = 1;
        return;
      }

      // Coordinates stand on their own — the docs geofence example carries no
      // country_, and anyIP picks the closest available peer to the point.
      const tag = (p: Place) => `lat_${p.latitude},lon_${p.longitude}`;

      if (opts.json) {
        console.log(
          JSON.stringify(
            places.map((p) => (wantsTags(opts) ? { ...p, tag: tag(p) } : p)),
            null,
            2
          )
        );
        return;
      }

      if (wantsTags(opts)) {
        places.forEach((p) => console.log(tag(p)));
        return;
      }

      display.printHeader(`Coordinates — ${query}`);
      const label = (p: Place) =>
        [p.name, p.admin1, p.country].filter(Boolean).join(", ");
      const width = Math.max(6, ...places.map((p) => label(p).length)) + 3;
      console.log(chalk.cyan(`  ${"Place".padEnd(width)}Username flags`));
      places.forEach((p) => {
        console.log(`  ${chalk.white(label(p).padEnd(width))}${chalk.yellow(tag(p))}`);
      });
      console.log(
        chalk.dim(
          `\n  ${places.length} ${places.length === 1 ? "match" : "matches"}` +
            " — append the flags to a proxy username, e.g." +
            ` user_1234,${tag(places[0])}\n`
        )
      );
    });
}
