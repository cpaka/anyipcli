import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as fs from "fs";
import * as api from "../api.js";
import * as display from "../display.js";
import * as sessions from "../sessions.js";
import { generateProxyPlan } from "../ai.js";
import type { ProxyOption, ProxyPlanItem } from "../ai.js";
import { getKeys } from "../config.js";
import { ask, specToProfile } from "../utils.js";
import type { ProxySpec } from "../utils.js";

// One setup: what it is, when to pick it, the sets it creates, and a row per
// username flag explaining why this use case needs it.
function printOption(option: ProxyOption, index: number): void {
  const badge =
    option.kind === "recommended"
      ? chalk.bgGreen.black(" RECOMMENDED ")
      : chalk.bgGray.black(" ALTERNATIVE ");

  console.log(
    `  ${chalk.bold.white(`${index})`)} ${badge} ${chalk.bold.white(option.name)}  ` +
      chalk.dim(`(${option.total_proxies} prox${option.total_proxies === 1 ? "y" : "ies"} · ~${option.estimated_total_quota_gb} GB)`)
  );
  console.log(`     ${chalk.white(option.summary)}`);
  console.log(`     ${chalk.green("Best for:")} ${chalk.dim(option.best_for)}`);
  console.log(`     ${chalk.yellow("Trade-off:")} ${chalk.dim(option.tradeoff)}`);
  console.log(`     ${chalk.cyan("Username:")} ${chalk.white(option.username_example)}\n`);

  for (const item of option.proxy_plan) {
    const tags = [
      chalk.cyan(item.type),
      item.country && `country=${chalk.yellow(item.country)}`,
      item.region && `region=${chalk.yellow(item.region)}`,
      item.city && `city=${chalk.yellow(item.city)}`,
      item.asn != null && `asn=${chalk.yellow(String(item.asn))}`,
      item.pool && `pool=${chalk.yellow(item.pool)}`,
      item.rotating ? chalk.dim("rotating") : `session=${chalk.yellow(item.session_prefix + "_N")}`,
      item.sess_time ? `sesstime=${item.sess_time}min` : null,
      `quota=${chalk.cyan(display.fmtBytes(item.quota_bytes))} each`,
    ]
      .filter(Boolean)
      .join("  ");

    console.log(`     ${chalk.bold.white(`×${item.count}`)}  ${chalk.white(item.description)}`);
    console.log(`         ${tags}`);
    if (item.notes) console.log(`         ${chalk.dim(item.notes)}`);
  }

  console.log();
  display.printFlagTable(option.flags);
  console.log();
}

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate [description...]")
    .alias("gen")
    .description("AI: analyze a use case and create the optimal proxy setup automatically")
    .option("-o, --output <file>", "Save credential list to file")
    .option("--dry-run", "Show plan without creating any proxies")
    .option(
      "--new-accounts",
      "Create one new proxy account per proxy instead of adding profiles to the accounts you already have"
    )
    .action(async (
      descParts: string[],
      opts: { output?: string; dryRun?: boolean; newAccounts?: boolean }
    ) => {
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

      plan.options.forEach((option, i) => printOption(option, i + 1));

      console.log(`  ${chalk.bold("Rotation strategy:")}`);
      console.log(`  ${chalk.dim(plan.rotation_strategy)}\n`);

      if (opts.dryRun) {
        display.info("Dry run — no proxies created.");
        return;
      }

      // ── Pick a setup ───────────────────────────────────────────────────────────
      const choices = plan.options.map((_, i) => String(i + 1));
      let chosen: ProxyOption | undefined;
      for (;;) {
        const answer = (
          await ask(
            `  ${chalk.yellow("Which setup should I create?")} [${choices.join("/")}, n to cancel] (1) `
          )
        ).trim().toLowerCase();

        if (answer === "n" || answer === "no") {
          display.info("Aborted.");
          return;
        }
        chosen = plan.options[answer === "" ? 0 : Number(answer) - 1];
        if (chosen) break;
        display.error(`Pick one of ${choices.join(", ")} — or n to cancel.`);
      }

      const confirm = await ask(
        `  ${chalk.yellow(
          `Create ${chosen.total_proxies} prox${chosen.total_proxies === 1 ? "y" : "ies"} for "${chosen.name}"?`
        )} [Y/n] `
      );
      if (confirm.trim().toLowerCase() === "n") {
        display.info("Aborted.");
        return;
      }
      const selected = chosen;

      // ── Expand the plan into one entry per proxy ───────────────────────────────
      interface Entry {
        item: ProxyPlanItem;
        idx: number;
        account: api.ProxyAccount;
        profile?: api.ProxyProfile;
      }
      const wanted: Array<{ item: ProxyPlanItem; idx: number }> = [];
      for (const item of selected.proxy_plan) {
        for (let i = 1; i <= item.count; i++) wanted.push({ item, idx: i });
      }

      // In v1 the targeting a plan describes lives on proxy *profiles*, and one
      // account carries many of them. Spending an account per planned proxy
      // burns the subscription's account allowance for nothing, so by default
      // profiles are added to the accounts that already exist; --new-accounts
      // restores the old one-account-per-proxy behaviour.
      const setupSpinner = ora("Loading proxy accounts…").start();
      let carriers: api.ProxyAccount[] = [];
      try {
        if (opts.newAccounts) {
          setupSpinner.text = `Creating ${wanted.length} proxy accounts…`;
          const BATCH = 5;
          for (let start = 0; start < wanted.length; start += BATCH) {
            const batch = wanted.slice(start, start + BATCH);
            setupSpinner.text = `Creating proxy accounts… (${Math.min(start + BATCH, wanted.length)}/${wanted.length})`;
            carriers.push(
              ...(await Promise.all(
                batch.map(({ item, idx }) =>
                  api.createProxy(anyipKey, {
                    description: `${item.description} #${idx}`,
                    enabled: true,
                    quota_bytes: item.quota_bytes,
                  })
                )
              ))
            );
          }
        } else {
          const { members } = await api.listProxies(anyipKey, { itemsPerPage: "100" });
          if (members.length === 0) {
            setupSpinner.text = "No proxy account yet — creating one to carry the profiles…";
            carriers = [
              await api.createProxy(anyipKey, {
                description: `anyip generate — ${description}`.slice(0, 120),
                enabled: true,
                quota_bytes: selected.proxy_plan[0]?.quota_bytes ?? 1_073_741_824,
              }),
            ];
          } else {
            // Credentials only come back on the single-account endpoint.
            const needed = Math.min(members.length, wanted.length);
            carriers = await Promise.all(
              members.slice(0, needed).map((m) => api.getProxy(anyipKey, m.id))
            );
          }
        }
        setupSpinner.stop();
      } catch (e) {
        setupSpinner.fail(String(e));
        if (String(e).includes("upgrade your subscription")) {
          display.info(
            opts.newAccounts
              ? "Your plan is out of proxy accounts — drop --new-accounts to attach profiles to the accounts you already have."
              : "Your plan is out of proxy accounts — create one from the dashboard first, then re-run."
          );
        }
        return;
      }

      // ── Create one profile per planned proxy ───────────────────────────────────
      const entries: Entry[] = [];
      const failures: string[] = [];
      const profileSpinner = ora(
        `Creating ${wanted.length} proxy profile${wanted.length === 1 ? "" : "s"}…`
      ).start();

      for (const [i, { item, idx }] of wanted.entries()) {
        // Round-robin so a plan bigger than your account list still spreads out.
        const account = carriers[opts.newAccounts ? i : i % carriers.length];
        profileSpinner.text = `Creating proxy profiles… (${i + 1}/${wanted.length})`;

        const spec: ProxySpec = {
          type: item.type,
          country: item.country ?? undefined,
          region: item.region ?? undefined,
          city: item.city ?? undefined,
          asn: item.asn ?? undefined,
          sticky: !item.rotating,
          sessTime: item.sess_time ?? undefined,
        };
        // Name it the way the plan reads, so the dashboard's profile list is
        // legible; the API only asks for at least 3 characters.
        const name = `${item.description} #${idx}`.slice(0, 60).padEnd(3, "_");

        try {
          const profile = await api.createProfile(
            anyipKey,
            specToProfile(spec, name, account.id)
          );
          entries.push({ item, idx, account, profile });
        } catch (e) {
          // A profile that fails still has working username flags, so keep the
          // local session and report what did not get stored server-side.
          failures.push(`${name}: ${String(e)}`);
          entries.push({ item, idx, account });
        }
      }

      const madeProfiles = entries.filter((e) => e.profile).length;
      if (failures.length === 0) {
        profileSpinner.succeed(
          `Created ${madeProfiles} profile${madeProfiles === 1 ? "" : "s"} across ` +
            `${new Set(entries.map((e) => e.account.id)).size} account(s)`
        );
      } else {
        profileSpinner.warn(
          `${madeProfiles}/${wanted.length} profiles created — ${failures.length} failed`
        );
        failures.slice(0, 3).forEach((f) => console.log(chalk.dim(`     ${f}`)));
      }

      // ── Save sessions locally ──────────────────────────────────────────────────
      for (const { item, idx, account } of entries) {
        if (!account.password) continue;

        const sessionName = item.rotating
          ? `gen_rotating_${Math.random().toString(16).slice(2, 8)}`
          : `${item.session_prefix}_${idx}`;

        const compositeUsername = [
          `user_${account.username}`,
          `type_${item.type}`,
          item.country && `country_${item.country}`,
          item.region  && `region_${item.region}`,
          item.city    && `city_${item.city}`,
          item.asn != null && `asn_${item.asn}`,
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
          password: account.password,
          country: item.country ?? undefined,
          region: item.region ?? undefined,
          city: item.city ?? undefined,
          asn: item.asn != null ? String(item.asn) : undefined,
          sessTime: item.sess_time ?? undefined,
          rotating: item.rotating,
          createdAt: new Date().toISOString(),
          userTag: account.username ?? undefined,
        });
      }

      // ── Build credential list ──────────────────────────────────────────────────
      const lines: string[] = [
        "# anyIP Proxy List — AI Generated",
        `# Use case: ${description}`,
        `# Generated: ${new Date().toISOString().slice(0, 10)}`,
        `# Total proxies: ${entries.length}`,
        "#",
        "# FORMAT: http://username:password@gate.anyip.io:8080",
        "",
      ];

      for (const item of selected.proxy_plan) {
        lines.push(`## ${item.description} (×${item.count})`);
        if (item.notes) lines.push(`# ${item.notes}`);
        for (const entry of entries.filter((e) => e.item === item)) {
          const { account } = entry;
          // The username carries the targeting, so print the composite form —
          // a bare user_XXXX would connect worldwide and ignore the plan.
          const flags = [
            `user_${account.username}`,
            `type_${item.type}`,
            item.country && `country_${item.country}`,
            item.region  && `region_${item.region}`,
            item.city    && `city_${item.city}`,
            item.asn != null && `asn_${item.asn}`,
            !item.rotating && item.session_prefix && `session_${item.session_prefix}_${entry.idx}`,
            item.sess_time != null && `sesstime_${item.sess_time}`,
          ].filter(Boolean).join(",");

          if (account.username && account.password) {
            lines.push(`http://${flags}:${account.password}@gate.anyip.io:8080`);
          } else {
            lines.push(`# ${account.username || account.id}  (password not returned — anyip account inspect ${account.id})`);
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
