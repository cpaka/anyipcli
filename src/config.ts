import Conf from "conf";

interface AppConfig {
  anyipKey?: string;
  claudeKey?: string;
  userToken?: string;
  teamId?: string;
  teamIdForKey?: string;
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
  },
});

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
      "    Or:  export ANYIP_API_KEY=your_key"
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
      "    Get a key at: https://console.anthropic.com"
    );
    process.exit(1);
  }
  return key;
}

export function getKeys(): { anyipKey: string; claudeKey: string } {
  return { anyipKey: getAnyipKey(), claudeKey: getClaudeKey() };
}
