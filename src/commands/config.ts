import { Command } from "commander";
import chalk from "chalk";
import { config, getConfigPath } from "../config.js";
import * as display from "../display.js";
import { ask, askSecret } from "../utils.js";

export function registerConfigCommands(program: Command): void {
  const configCmd = program.command("config").description("Manage CLI configuration");

  configCmd
    .command("set-keys")
    .description("Set your anyIP and Claude API keys")
    .option("--anyip <key>", "anyIP API key (prompts if omitted)")
    .option("--claude <key>", "Claude (Anthropic) API key (prompts if omitted)")
    .action(async (opts: { anyip?: string; claude?: string }) => {
      let anyipKey = opts.anyip;
      let claudeKey = opts.claude;

      if (!anyipKey && !claudeKey) {
        // Fully interactive — neither flag was given
        console.log(chalk.dim("\n  Keys are stored locally. Press Enter to keep existing value."));
        console.log(
          chalk.dim("  anyIP  : https://anyip.io/account/settings/api-keys  (sign in first)")
        );
        console.log(
          chalk.dim("  Claude : https://platform.claude.com/settings/workspaces/default/keys  (optional)\n")
        );
        anyipKey = (await askSecret("  anyIP API key      : ")).trim() || undefined;
        claudeKey = (await askSecret("  Claude API key     : ")).trim() || undefined;
        console.log();
      }

      if (anyipKey) {
        config.set("anyipKey", anyipKey);
        display.success("anyIP key saved");
      }
      if (claudeKey) {
        config.set("claudeKey", claudeKey);
        display.success("Claude key saved");
      }
      if (!anyipKey && !claudeKey) {
        display.info("No keys changed.");
      }
    });

  configCmd
    .command("show")
    .description("Show current config (keys masked) and config file location")
    .action(() => {
      const ak = process.env.ANYIP_API_KEY ?? config.get("anyipKey");
      const ck = process.env.ANTHROPIC_API_KEY ?? config.get("claudeKey");
      const mask = (k?: string) =>
        k
          ? `${k.slice(0, 6)}${"*".repeat(Math.max(0, k.length - 10))}${k.slice(-4)}`
          : chalk.red("not set");

      const envNote = (envKey: string) =>
        process.env[envKey] ? chalk.dim(` (from $${envKey})`) : "";

      console.log();
      console.log(`  anyIP key : ${chalk.yellow(mask(ak))}${envNote("ANYIP_API_KEY")}`);
      console.log(`  Claude key: ${chalk.yellow(mask(ck))}${envNote("ANTHROPIC_API_KEY")}`);
      console.log(`  Config file: ${chalk.dim(getConfigPath())}`);
      console.log();
    });

  configCmd
    .command("clear")
    .description("Clear all stored keys")
    .action(async () => {
      const confirm = await ask("  Clear all stored config? [y/N] ");
      if (confirm.trim().toLowerCase() !== "y") {
        display.info("Aborted.");
        return;
      }
      config.clear();
      display.success("Configuration cleared");
    });
}
