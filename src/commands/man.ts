import { Command } from "commander";
import chalk from "chalk";
import { EN_MANUAL } from "../manual/en.js";
import { ZH_MANUAL } from "../manual/zh.js";
import { RU_MANUAL } from "../manual/ru.js";
import * as display from "../display.js";
import { getClaudeKey } from "../config.js";

const STATIC_LANGS: Record<string, string> = {
  en:       EN_MANUAL,
  english:  EN_MANUAL,
  zh:       ZH_MANUAL,
  cn:       ZH_MANUAL,
  chinese:  ZH_MANUAL,
  mandarin: ZH_MANUAL,
  "中文":   ZH_MANUAL,
  "普通话": ZH_MANUAL,
  ru:       RU_MANUAL,
  russian:  RU_MANUAL,
  "русский": RU_MANUAL,
};

function resolveStaticManual(lang: string): string | undefined {
  return STATIC_LANGS[lang.toLowerCase()];
}

export function registerManCommand(program: Command): void {
  program
    .command("man")
    .description("Show the CLI manual (en/zh/ru built-in; other languages via Claude)")
    .option("-l, --language <lang>", "Language name or code (en, zh, ru, French, …)", "en")
    .action(async (opts: { language: string }) => {
      const manual = resolveStaticManual(opts.language);

      if (manual) {
        display.printHeader(`Manual — ${opts.language}`);
        console.log(manual);
        return;
      }

      // Dynamic generation for other languages via Claude
      const claudeKey = getClaudeKey();
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: claudeKey });

      display.printHeader(`Manual — ${opts.language}`);
      console.log(chalk.dim("  Generating documentation via Claude…\n"));

      const stream = client.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: `You are a technical writer producing CLI documentation. Write clearly and professionally in the language: ${opts.language}. If given a 2-letter ISO code, detect and use the correct full language.`,
        messages: [
          {
            role: "user",
            content: `Write a complete, practical user manual for the "anyip" CLI tool in ${opts.language}.

Cover these sections with command examples:
1. Overview — what anyIP.io is and what this CLI does
2. First-time setup: anyip config set-keys, env vars
3. Account management: me, list, inspect, create, enable, disable, bulk-reset
4. Session management: anyip get, anyip proxy list/add/import/delete
5. Traffic monitoring: list, export
6. Geographic reference data: countries, regions, asn
7. AI Proxy Generator: anyip generate
8. Web dashboard: anyip serve
9. Proxy URL format
10. Environment variables and tips

Use headers and real command examples. Keep it practical and concise.`,
          },
        ],
      });

      stream.on("text", (text) => process.stdout.write(text));
      await stream.finalMessage();
      console.log("\n");
    });
}
