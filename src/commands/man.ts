import { Command } from "commander";
import chalk from "chalk";
import { EN_MANUAL } from "../manual/en.js";
import { ZH_MANUAL } from "../manual/zh.js";
import { RU_MANUAL } from "../manual/ru.js";
import { FR_MANUAL } from "../manual/fr.js";
import { ES_MANUAL } from "../manual/es.js";
import * as display from "../display.js";
import { getClaudeKey } from "../config.js";

type ManOpts = {
  fr?: boolean;
  es?: boolean;
  zh?: boolean;
  ru?: boolean;
  language?: string;
};

const FLAG_MANUALS: Array<[keyof ManOpts, string, string]> = [
  ["fr", FR_MANUAL, "fr"],
  ["es", ES_MANUAL, "es"],
  ["zh", ZH_MANUAL, "zh"],
  ["ru", RU_MANUAL, "ru"],
];

const LANG_MANUALS: Record<string, string> = {
  en: EN_MANUAL, english: EN_MANUAL,
  fr: FR_MANUAL, french: FR_MANUAL, français: FR_MANUAL, francais: FR_MANUAL,
  es: ES_MANUAL, spanish: ES_MANUAL, español: ES_MANUAL, espanol: ES_MANUAL,
  zh: ZH_MANUAL, cn: ZH_MANUAL, chinese: ZH_MANUAL, mandarin: ZH_MANUAL, "中文": ZH_MANUAL, "普通话": ZH_MANUAL,
  ru: RU_MANUAL, russian: RU_MANUAL, "русский": RU_MANUAL,
};

function resolveManual(opts: ManOpts): { manual: string; label: string } | { lang: string } {
  for (const [flag, manual, label] of FLAG_MANUALS) {
    if (opts[flag]) return { manual, label };
  }
  const lang = opts.language ?? "en";
  const manual = LANG_MANUALS[lang.toLowerCase()];
  return manual ? { manual, label: lang } : { lang };
}

export function registerManCommand(program: Command): void {
  program
    .command("man")
    .description("Show the CLI manual (en/fr/es/zh/ru built-in; other languages via Claude)")
    .option("--fr", "French (Français)")
    .option("--es", "Spanish (Español)")
    .option("--zh", "Chinese (中文)")
    .option("--ru", "Russian (Русский)")
    .option("-l, --language <lang>", "Any language name or code (for unlisted languages, uses Claude)")
    .action(async (opts: ManOpts) => {
      const resolved = resolveManual(opts);

      if ("manual" in resolved) {
        display.printHeader(`Manual — ${resolved.label}`);
        console.log(resolved.manual);
        return;
      }

      const { lang } = resolved;

      // Dynamic generation for other languages via Claude
      const claudeKey = getClaudeKey();
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: claudeKey });

      display.printHeader(`Manual — ${lang}`);
      console.log(chalk.dim("  Generating documentation via Claude…\n"));

      const stream = client.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: `You are a technical writer producing CLI documentation. Write clearly and professionally in the language: ${lang}. If given a 2-letter ISO code, detect and use the correct full language.`,
        messages: [
          {
            role: "user",
            content: `Write a complete, practical user manual for the "anyip" CLI tool in ${lang}.

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
