import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as api from "../api.js";
import * as display from "../display.js";
import { getAnyipKey } from "../config.js";
import { ask, buildProxySpec, specHasTargeting, specToProfile } from "../utils.js";

export function registerAccountCommands(program: Command): void {
  const account = program
    .command("account")
    .description("Manage proxy accounts")
    .action(async () => {
      const anyipKey = getAnyipKey();
      const spinner = ora("Loading accounts…").start();
      try {
        const { members, total } = await api.listProxies(anyipKey, { itemsPerPage: "100" });
        spinner.stop();
        display.printHeader(`Proxy Accounts (${total} total)`);
        if (members.length === 0) {
          display.info("No proxy accounts found.");
          return;
        }
        display.printUsersTable(members);
        console.log();
      } catch (e) {
        spinner.fail(formatError(e));
      }
    });

  account
    .command("me")
    .description("Show your anyIP account info and quota")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      const anyipKey = getAnyipKey();
      const spinner = ora("Fetching account…").start();
      try {
        const user = await api.getMe(anyipKey);
        const [usage, sub] = await Promise.all([
          api.getTeamUsage(anyipKey),
          api.getSubscription(anyipKey).catch(() => undefined),
        ]);
        spinner.stop();
        if (opts.json) {
          console.log(JSON.stringify({ user, usage, subscription: sub }, null, 2));
        } else {
          display.printUserCard(user, usage, sub);
        }
      } catch (e) {
        spinner.fail(formatError(e));
      }
    });

  account
    .command("list")
    .alias("ls")
    .description("List all proxy accounts")
    .option("-p, --page <n>", "Page number", "1")
    .option("-n, --limit <n>", "Items per page", "20")
    .option("--json", "Output raw JSON")
    .action(async (opts: { page: string; limit: string; json?: boolean }) => {
      const anyipKey = getAnyipKey();
      const spinner = ora("Loading accounts…").start();
      try {
        const { members, total } = await api.listProxies(anyipKey, {
          page: opts.page,
          itemsPerPage: opts.limit,
        });
        spinner.stop();
        if (opts.json) {
          console.log(JSON.stringify(members, null, 2));
          return;
        }
        display.printHeader(`Proxy Accounts (${total} total)`);
        if (members.length === 0) {
          display.info("No proxy accounts found. Create one with: anyip account create");
          return;
        }
        display.printProxiesTable(members);
        console.log(chalk.dim(`  Page ${opts.page} · ${members.length} of ${total}`));
        console.log();
      } catch (e) {
        spinner.fail(formatError(e));
      }
    });

  account
    .command("inspect <id>")
    .alias("get")
    .description("Show full details for a proxy account")
    .option("--json", "Output raw JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      const anyipKey = getAnyipKey();
      const spinner = ora(`Fetching account ${id}…`).start();
      try {
        const proxy = await api.getProxy(anyipKey, id);
        spinner.stop();
        if (opts.json) {
          console.log(JSON.stringify(proxy, null, 2));
        } else {
          display.printProxyCard(proxy);
        }
      } catch (e) {
        spinner.fail(formatError(e));
      }
    });

  account
    .command("create")
    .description("Create a proxy account (and a proxy profile if targeting options are given)")
    .requiredOption("-d, --description <desc>", "Proxy description")
    .option("--type <type>", "Network type: residential | mobile")
    .option("--country <code>", "Country ISO code (e.g. US, FR)")
    .option("--region <name>", "Region/state name")
    .option("--city <name>", "City name")
    .option("--asn <number>", "ISP/carrier ASN number")
    .option("--session <name>", "Sticky session (kept for compat — enables sticky mode)")
    .option("--sess-time <min>", "Sticky session duration in minutes")
    .option("--quota <bytes>", "Bandwidth quota in bytes", "1073741824")
    .option("--password <pass>", "Custom password (auto-generated if omitted)")
    .option("--json", "Output raw JSON")
    .action(async (opts: {
      description: string;
      type?: string;
      country?: string;
      region?: string;
      city?: string;
      asn?: string;
      session?: string;
      sessTime?: string;
      quota?: string;
      password?: string;
      json?: boolean;
    }) => {
      const anyipKey = getAnyipKey();
      const spec = buildProxySpec(opts);

      const spinner = ora("Creating proxy account…").start();
      try {
        const proxy = await api.createProxy(anyipKey, {
          description: opts.description,
          enabled: true,
          quota_bytes: parseInt(opts.quota ?? "1073741824", 10),
          password: opts.password,
        });

        // Location/session targeting moved to proxy profiles in API v1
        let profile: api.ProxyProfile | undefined;
        if (specHasTargeting(spec)) {
          spinner.text = "Creating proxy profile…";
          profile = await api.createProfile(
            anyipKey,
            specToProfile(spec, opts.description, proxy.id)
          );
        }

        spinner.stop();
        if (opts.json) {
          console.log(JSON.stringify(profile ? { account: proxy, profile } : proxy, null, 2));
        } else {
          display.success("Proxy account created!");
          if (profile) display.success(`Proxy profile "${profile.name}" created (id: ${profile.id})`);
          display.printProxyCard(proxy);
        }
      } catch (e) {
        spinner.fail(formatError(e));
      }
    });

  account
    .command("enable <id>")
    .description("Enable a proxy account")
    .action(async (id: string) => {
      const anyipKey = getAnyipKey();
      const spinner = ora("Enabling…").start();
      try {
        await api.updateProxy(anyipKey, id, { enabled: true });
        spinner.succeed("Proxy account enabled");
      } catch (e) {
        spinner.fail(formatError(e));
      }
    });

  account
    .command("disable <id>")
    .description("Disable a proxy account")
    .action(async (id: string) => {
      const anyipKey = getAnyipKey();
      const spinner = ora("Disabling…").start();
      try {
        await api.updateProxy(anyipKey, id, { enabled: false });
        spinner.succeed("Proxy account disabled");
      } catch (e) {
        spinner.fail(formatError(e));
      }
    });

  account
    .command("reset <id>")
    .description("Reset bandwidth quota for one proxy account")
    .action(async (id: string) => {
      const anyipKey = getAnyipKey();
      const spinner = ora("Resetting quota…").start();
      try {
        await api.resetQuota(anyipKey, id);
        spinner.succeed("Quota reset");
      } catch (e) {
        spinner.fail(formatError(e));
      }
    });

  account
    .command("delete <id>")
    .alias("rm")
    .description("Delete a proxy account")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (id: string, opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const confirm = await ask(
          `  ${chalk.yellow(`Delete proxy account ${id}?`)} [y/N] `
        );
        if (confirm.trim().toLowerCase() !== "y") {
          display.info("Aborted.");
          return;
        }
      }
      const anyipKey = getAnyipKey();
      const spinner = ora("Deleting…").start();
      try {
        await api.deleteProxy(anyipKey, id);
        spinner.succeed("Proxy account deleted");
      } catch (e) {
        spinner.fail(formatError(e));
      }
    });

  account
    .command("bulk-reset")
    .description("Reset bandwidth quota for all proxy accounts")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const confirm = await ask(
          `  ${chalk.yellow("Reset bandwidth quota for ALL accounts?")} [y/N] `
        );
        if (confirm.trim().toLowerCase() !== "y") {
          display.info("Aborted.");
          return;
        }
      }
      const anyipKey = getAnyipKey();
      const spinner = ora("Resetting all quotas…").start();
      try {
        const count = await api.bulkResetQuota(anyipKey);
        spinner.succeed(`Quota reset for ${count} account(s)`);
      } catch (e) {
        spinner.fail(formatError(e));
      }
    });
}

function formatError(e: unknown): string {
  if (e instanceof Error) {
    const msg = e.message;
    if (msg.includes("401") || msg.includes("Unauthorized")) {
      return `${msg}\n  → Check your API key: anyip config show`;
    }
    if (msg.includes("403") || msg.includes("Forbidden")) {
      return `${msg}\n  → Your account may lack permission for this action`;
    }
    if (msg.includes("429")) {
      return `${msg}\n  → Rate limited. Wait a moment and retry`;
    }
    return msg;
  }
  return String(e);
}
