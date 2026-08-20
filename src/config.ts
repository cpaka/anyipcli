import Conf from "conf";
import { chmodSync } from "fs";
import { dirname } from "path";

export interface Theme {
  brand: string;       // primary — buttons, links, active tabs
  brandLight: string;  // tinted backgrounds (badges, code blocks)
  brandDark: string;   // hover/pressed states
}

// The palette the dashboard ships with; anything unset falls back to these.
export const DEFAULT_THEME: Theme = {
  brand: "#5C0FBA",
  brandLight: "#f3ecfb",
  brandDark: "#430b87",
};

interface AppConfig {
  anyipKey?: string;
  claudeKey?: string;
  userToken?: string;
  teamId?: string;
  teamIdForKey?: string;
  theme?: Partial<Theme>;
}

export const config = new Conf<AppConfig>({
  projectName: "anyip-cli",
  schema: {
    anyipKey: { type: "string" },
    claudeKey: { type: "string" },
    userToken: { type: "string" },
    // v1 API team scope, cached per API key (see api.getTeamId)
    teamId: { type: "string" },
    teamIdForKey: { type: "string" },
    // Dashboard palette (anyip serve → Settings → Appearance)
    theme: {
      type: "object",
      properties: {
        brand: { type: "string" },
        brandLight: { type: "string" },
        brandDark: { type: "string" },
      },
      additionalProperties: false,
    },
  },
});

export function getTheme(): Theme {
  return { ...DEFAULT_THEME, ...(config.get("theme") ?? {}) };
}

// ── File permissions ───────────────────────────────────────────────────────────
// conf writes plain JSON at the process umask — 0644 on a typical machine, so
// every local account could read the API keys. Nothing here is encrypted, so
// the file mode is the protection: owner-only, on the directory too.
export function hardenPermissions(file: string): void {
  try {
    chmodSync(dirname(file), 0o700);
    chmodSync(file, 0o600);
  } catch {
    // Windows and odd filesystems ignore POSIX modes — not worth failing over.
  }
}

hardenPermissions(config.path);

// Every write recreates the file, so re-apply the mode after each one —
// delete and clear rewrite it just as set does.
export function hardenAfterWrites<T extends { path: string }>(store: T, methods: string[]): void {
  for (const method of methods) {
    const original = (store as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
    if (typeof original !== "function") continue;
    (store as unknown as Record<string, (...a: unknown[]) => unknown>)[method] = (
      ...args: unknown[]
    ) => {
      const result = original.apply(store, args);
      hardenPermissions(store.path);
      return result;
    };
  }
}

hardenAfterWrites(config, ["set", "delete", "clear", "reset"]);

export function getConfigPath(): string {
  return config.path;
}

// Env vars take priority over stored config
export function getAnyipKey(): string {
  const key = process.env.ANYIP_API_KEY ?? config.get("anyipKey");
  if (!key) {
    console.error(
      "❌  anyIP key not set.\n" +
      "    Run: anyip config set-keys\n" +
      "    Or:  export ANYIP_API_KEY=your_key\n" +
      "    Get a key: sign in at https://anyip.io/account/ →\n" +
      "               https://anyip.io/account/settings/api-keys"
    );
    process.exit(1);
  }
  return key;
}

// Claude key is optional at config level — only commands that use AI call this
export function getClaudeKey(): string {
  const key = process.env.ANTHROPIC_API_KEY ?? config.get("claudeKey");
  if (!key) {
    console.error(
      "❌  Claude (Anthropic) key not set.\n" +
      "    Run: anyip config set-keys --claude YOUR_KEY\n" +
      "    Or:  export ANTHROPIC_API_KEY=your_key\n" +
      "    Get a key at: https://platform.claude.com/settings/workspaces/default/keys"
    );
    process.exit(1);
  }
  return key;
}

export function getKeys(): { anyipKey: string; claudeKey: string } {
  return { anyipKey: getAnyipKey(), claudeKey: getClaudeKey() };
}
