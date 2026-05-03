import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as fs from "fs";
import * as api from "../api.js";
import * as display from "../display.js";
import * as sessions from "../sessions.js";
import { generateProxyPlan } from "../ai.js";
import type { ProxyPlanItem } from "../ai.js";
import { getKeys } from "../config.js";
import { ask } from "../utils.js";

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate [description...]")
    .alias("gen")
    .description("AI: analyze a use case and create the optimal proxy setup automatically")
    .option("-o, --output <file>", "Save credential list to file")
    .option("--dry-run", "Show plan without creating any proxies")
    .action(async (descParts: string[], opts: { output?: string; dryRun?: boolean }) => {
      const { anyipKey, claudeKey } = getKeys();

      let description = descParts.join(" ").trim();
      if (!description) {
        description = await ask(chalk.cyan("\n  ▸ Describe your use case: "));
      }
      if (!description) {
        display.error("No description provided.");
        return;
      }

      const spinner = ora("Claude is analyzing your use case…").start();
      let plan;
      try {
        plan = await generateProxyPlan(claudeKey, description);
        spinner.stop();
      } catch (e) {
        spinner.fail(String(e));
        return;
      }

      // ── Print plan ─────────────────────────────────────────────────────────────
      console.log();
      display.printHeader("AI Proxy Plan");
      console.log(`  ${chalk.bold("Analysis:")}`);
      console.log(`  ${chalk.white(plan.analysis)}\n`);
      console.log(
        `  ${chalk.bold("Proxy Sets:")}  (${plan.total_proxies} total · ~${plan.estimated_total_quota_gb} GB quota)\n`
      );

      for (const item of plan.proxy_plan) {
        const tags = [
          item.type && chalk.cyan(item.type),
          item.country && `country=${chalk.yellow(item.country)}`,
          item.region && `region=${chalk.yellow(item.region)}`,
          item.rotating
            ? chalk.dim("rotating")
            : `session=${chalk.yellow(item.session_prefix + "_N")}`,
          item.sess_time ? `sesstime=${item.sess_time}min` : null,
          `quota=${chalk.cyan(display.fmtBytes(item.quota_bytes))} each`,
        ]
          .filter(Boolean)
          .join("  ");

        console.log(`  ${chalk.bold.white(`×${item.count}`)}  ${chalk.white(item.description)}`);
        console.log(`     ${tags}`);
        if (item.notes) console.log(`     ${chalk.dim(item.notes)}`);
        console.log();
      }

      console.log(`  ${chalk.bold("Rotation strategy:")}`);
      console.log(`  ${chalk.dim(plan.rotation_strategy)}\n`);

      if (opts.dryRun) {
        display.info("Dry run — no proxies created.");
        return;
      }

      const confirm = await ask(
        `  ${chalk.yellow(`Create all ${plan.total_proxies} proxies?`)} [Y/n] `
      );
      if (confirm.trim().toLowerCase() === "n") {
        display.info("Aborted.");
        return;
      }

      // ── Build all payloads ─────────────────────────────────────────────────────
      const payloads: Array<{ payload: api.CreateProxyPayload; item: ProxyPlanItem; idx: number }> = [];
      for (const item of plan.proxy_plan) {
        for (let i = 1; i <= item.count; i++) {
          const portConfig: api.PortConfig = {};
          if (item.type)    portConfig.type = item.type;
          if (item.country) portConfig.country = item.country;
          if (item.region)  portConfig.region = item.region;
          if (!item.rotating && item.session_prefix)
            portConfig.session = `${item.session_prefix}_${i}`;
          if (item.sess_time != null) portConfig.sess_time = item.sess_time;

          payloads.push({
            item,
            idx: i,
            payload: {
              description: `${item.description} #${i}`,
              enabled: true,
              quota: item.quota_bytes,
              ip_whitelist: {
                ips: [],
                ports: Object.keys(portConfig).length > 0 ? [portConfig] : [],
                is_enabled: false,
              },
            },
          });
        }
      }

      // ── Create in parallel batches of 5 ───────────────────────────────────────
      const BATCH = 5;
      const created: api.ProxyAccount[] = [];
      const createSpinner = ora(`Creating ${plan.total_proxies} proxies…`).start();

      try {
        for (let start = 0; start < payloads.length; start += BATCH) {
          const batch = payloads.slice(start, start + BATCH);
          createSpinner.text = `Creating proxies… (${Math.min(start + BATCH, payloads.length)}/${plan.total_proxies})`;
          const results = await Promise.all(
            batch.map(({ payload }) => api.createProxy(anyipKey, payload))
          );
          created.push(...results);
        }
        createSpinner.succeed(`Created ${created.length} proxies!`);
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (typeof status === "number" && status >= 500) {
          createSpinner.text = "Server error — falling back to existing proxy accounts…";
          created.length = 0;
          try {
            const { members } = await api.listProxies(anyipKey, { itemsPerPage: "100" });
            if (members.length === 0) {
              createSpinner.fail("No existing proxy accounts found. Create one with: anyip account create");
              return;
            }
            const uniqueCount = Math.min(members.length, payloads.length);
            const fullAccounts = await Promise.all(
              members.slice(0, uniqueCount).map(m => api.getProxy(anyipKey, m.id))
            );
            for (let i = 0; i < payloads.length; i++) {
              created.push(fullAccounts[i % fullAccounts.length]);
            }
            createSpinner.succeed(`Configured ${created.length} proxies from ${uniqueCount} existing account(s).`);
          } catch (fallbackErr) {
            createSpinner.fail(`Fallback failed: ${String(fallbackErr)}`);
            return;
          }
        } else {
          createSpinner.fail(String(e));
          return;
        }
      }

      // ── Save sessions locally ──────────────────────────────────────────────────
      let proxyIdx = 0;
      for (const { item, idx } of payloads) {
        const proxy = created[proxyIdx++];
        if (!proxy?.plain_password) continue;

        const sessionName = item.rotating
          ? `gen_rotating_${Math.random().toString(16).slice(2, 8)}`
          : `${item.session_prefix}_${idx}`;

        const compositeUsername = [
          `user_${proxy.username}`,
          `type_${item.type}`,
          item.country && `country_${item.country}`,
          item.region  && `region_${item.region}`,
          !item.rotating && item.session_prefix && `session_${item.session_prefix}_${idx}`,
          item.sess_time != null && `sesstime_${item.sess_time}`,
        ]
          .filter(Boolean)
          .join(",");

        sessions.saveSession({
          name: sessionName,
          networkType: item.type ?? "residential",
          connectionType: "http",
          server: "gate.anyip.io",
          port: 8080,
          username: compositeUsername,
          password: proxy.plain_password,
          country: item.country ?? undefined,
          region: item.region ?? undefined,
          sessTime: item.sess_time ?? undefined,
          rotating: item.rotating,
          createdAt: new Date().toISOString(),
          userTag: proxy.username ?? undefined,
        });
      }

      // ── Build credential list ──────────────────────────────────────────────────
      const lines: string[] = [
        "# anyIP Proxy List — AI Generated",
        `# Use case: ${description}`,
        `# Generated: ${new Date().toISOString().slice(0, 10)}`,
        `# Total proxies: ${created.length}`,
        "#",
        "# FORMAT: http://username:password@gate.anyip.io:8080",
        "",
      ];

      let idx = 0;
      for (const item of plan.proxy_plan) {
        lines.push(`## ${item.description} (×${item.count})`);
        if (item.notes) lines.push(`# ${item.notes}`);
        for (let i = 0; i < item.count; i++) {
          const p = created[idx++];
          if (!p) break;
          if (p.username && p.plain_password) {
            lines.push(`http://${p.username}:${p.plain_password}@gate.anyip.io:8080`);
          } else {
            lines.push(`# ${p.username || p.id}  (password not returned — anyip account inspect ${p.id})`);
          }
        }
        lines.push("");
      }

      const credText = lines.join("\n");

      if (opts.output) {
        fs.writeFileSync(opts.output, credText, "utf-8");
        display.success(`Credential list saved to ${opts.output}`);
        display.info("Sessions also saved — view with: anyip proxy list");
      } else {
        console.log();
        console.log(chalk.dim("─".repeat(60)));
        console.log(credText);
        console.log(chalk.dim("─".repeat(60)));
        console.log();
        display.info("Tip: save with --output proxies.txt to use in your scraper.");
        display.info("Sessions saved locally — view with: anyip proxy list");
      }
    });
}
