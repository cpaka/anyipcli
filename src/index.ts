import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { spawnSync } from "child_process";

import { config, getAnyipKey, getKeys } from "./config.js";
import * as api from "./api.js";
import * as display from "./display.js";
import * as sessions from "./sessions.js";
import { ask } from "./utils.js";

import { registerConfigCommands } from "./commands/config.js";
import { registerAccountCommands } from "./commands/account.js";
import { registerTrafficCommands } from "./commands/traffic.js";
import { registerDataCommands } from "./commands/data.js";
import { registerGetCommand, registerProxyCommands } from "./commands/proxy.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerManCommand } from "./commands/man.js";
import { registerServeCommand } from "./commands/serve.js";

const program = new Command();

program
  .name("anyip")
  .description(chalk.cyan("anyIP.io CLI") + " — Manage proxies from your terminal")
  .version("1.0.0");

// ── Register all command groups ────────────────────────────────────────────────

registerConfigCommands(program);
registerAccountCommands(program);
registerTrafficCommands(program);
registerDataCommands(program);
registerGetCommand(program);
registerProxyCommands(program);
registerGenerateCommand(program);
registerManCommand(program);
registerServeCommand(program);

// ── login ──────────────────────────────────────────────────────────────────────

program
  .command("login")
  .description("Login with email and password to get an auth token")
  .requiredOption("--u <email>", "Your anyIP email")
  .requiredOption("--p <password>", "Your anyIP password")
  .option("--claude <key>", "Claude (Anthropic) API key to enable AI features")
  .action(async (opts: { u: string; p: string; claude?: string }) => {
    const anyipKey = getAnyipKey();
    const spinner = ora("Logging in…").start();
    try {
      const { token } = await api.login(anyipKey, opts.u, opts.p);
      config.set("userToken", token);
      spinner.succeed("Logged in successfully");
      if (opts.claude) {
        config.set("claudeKey", opts.claude);
        display.success("Claude key saved");
      }
    } catch (e) {
      spinner.fail(String(e));
    }
  });

// ── test — quick proxy connectivity check ─────────────────────────────────────

program
  .command("test <number>")
  .description("Test proxy account #N via curl → ip-api.com/json")
  .action(async (numStr: string) => {
    const n = parseInt(numStr, 10);
    if (isNaN(n) || n < 1) {
      display.error("Provide a valid proxy number (e.g. anyip test 1)");
      process.exit(1);
    }

    const anyipKey = getAnyipKey();
    const spinner = ora("Loading accounts…").start();
    try {
      const { members, total } = await api.listProxies(anyipKey, { itemsPerPage: "100" });
      if (n > members.length) {
        spinner.fail(`Only ${members.length} account(s) available (total: ${total})`);
        return;
      }

      const entry = members[n - 1];
      spinner.text = `Fetching credentials for proxy #${n} (${entry.username})…`;
      const proxy = await api.getProxy(anyipKey, entry.id);
      spinner.stop();

      if (!proxy.plain_password) {
        display.error("Password not available — recreate the proxy account via the dashboard.");
        return;
      }

      const proxyUrl = `http://user_${proxy.username}:${proxy.plain_password}@portal.anyip.io:1080`;
      console.log(chalk.dim(`  #${n}  user_${proxy.username}  ${proxy.description ?? ""}`));
      console.log();

      const result = spawnSync("curl", ["-s", "-x", proxyUrl, "http://ip-api.com/json/"], {
        timeout: 15000,
        encoding: "utf8",
      });

      if (result.error) {
        display.error(`curl failed: ${result.error.message}`);
        return;
      }

      try {
        const json = JSON.parse(result.stdout) as Record<string, unknown>;
        console.log(chalk.bold("  IP Info:"));
        Object.entries(json).forEach(([k, v]) =>
          console.log(`  ${chalk.dim(k.padEnd(14))} ${chalk.white(String(v))}`)
        );
      } catch {
        console.log(result.stdout);
      }
      console.log();
    } catch (e) {
      spinner.fail(String(e));
    }
  });

// ── Show help when called with no args ────────────────────────────────────────

if (process.argv.length === 2) {
  program.outputHelp();
  process.exit(0);
}

program.parse(process.argv);
