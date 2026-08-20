# anyIP CLI ⬡

> **Manage residential & mobile proxies from your terminal** — powered by [anyIP.io](https://anyip.io) and Claude AI.

---

## ✨ What is this?

**anyIP CLI** is a TypeScript command-line tool that puts your entire proxy infrastructure at your fingertips. Instead of clicking through a web dashboard, you can:

- 🚀 **Create proxy accounts** in seconds with a single command
- 🤖 **Describe your use case in plain English** — Claude AI builds the optimal proxy setup for you
- 📊 **Monitor bandwidth and traffic** per account, per domain, per date range
- 🔌 **Test proxy connectivity** live with a built-in curl checker
- 💾 **Save and reuse proxy sessions** locally without re-fetching credentials
- 🌐 **Launch a local web dashboard** if you prefer a GUI
- 📖 **Read the manual in Chinese or Russian** — built-in, no API call needed

---

## 📦 Installation

### Global install *(recommended)*
```bash
npm install -g anyip-cli
anyip --help
```

### From source
```bash
git clone https://github.com/cpaka/anyipcli
cd anyipcli
npm install
npm run build
npm link          # makes `anyip` available globally
```

### One-off use without installing
```bash
npx anyip-cli <command>
```

---

## ⚡ Quick Start

```bash
# 1. Save your API keys (interactive masked prompt — never stored in shell history)
anyip config set-keys

# 2. List your proxy accounts
anyip account list

# 3. Get a working proxy and test it instantly
anyip get --residential --location US

# 4. Generate a full proxy setup with AI
anyip generate "scrape Amazon prices across 5 US cities, rotating IPs"
```

---

## 🔐 Authentication

### Option A — Interactive prompt *(safest — keys stay out of shell history)*
```bash
anyip config set-keys
#  anyIP API key      : ************
#  Claude API key     : ************
```

### Option B — Flags
```bash
anyip config set-keys --anyip YOUR_ANYIP_KEY --claude YOUR_CLAUDE_KEY
```

### Option C — Environment variables *(perfect for CI/CD)*
```bash
export ANYIP_API_KEY=your_anyip_key
export ANTHROPIC_API_KEY=your_claude_key  # optional — only needed for AI commands
```

> 🟡 **Environment variables always take priority** over stored config.
> 🟢 **Claude key is optional** — only `anyip generate` and `anyip man` (non-English) use it.

```bash
anyip config show    # view masked keys + config file path
anyip config clear   # wipe stored config
```

---

## 🔒 Local Data & Privacy

All credentials and proxy session data are stored **on your machine only** — nothing is included in this repository or sent anywhere except the anyIP.io API.

| File | Location (macOS / Linux) | What it contains |
|------|--------------------------|-----------------|
| `config.json` | `~/Library/Preferences/anyip-cli-nodejs/` · `~/.config/anyip-cli-nodejs/` | API keys (encrypted by OS keychain on macOS) |
| `sessions.json` | same directory | Saved proxy sessions (server, port, username, password) |

These files are **outside the project directory** — git never sees them, and they are never pushed to any repository. There is nothing to add to `.gitignore` for them.

If you ever need to inspect or wipe the stored data:
```bash
anyip config show     # show masked keys and the config file path
anyip config clear    # wipe stored API keys
anyip proxy clear     # wipe all saved proxy sessions
```

---

## 📡 Account Management

```bash
anyip account                        # table of all proxy accounts (indexed)
anyip account me                     # your anyIP account info & total quota
anyip account list                   # same as above
anyip account list --json            # 🔧 machine-readable JSON for scripting
anyip account inspect <id>           # full detail card for one account
anyip account inspect <id> --json

# Create with explicit options
anyip account create \
  --description "FR Instagram bot" \
  --type mobile \
  --country FR \
  --session ig_fr_1 \
  --quota 2147483648

anyip account enable <id>
anyip account disable <id>
anyip account reset <id>             # reset one account's bandwidth quota
anyip account delete <id>            # delete an account (asks for confirmation)
anyip account bulk-reset             # ⚠️ resets ALL quotas — asks for confirmation
anyip account bulk-reset --yes       # skip confirmation (safe for scripts)
```

### Create options
| Flag | Description |
|------|-------------|
| `-d, --description` | **Required.** Label for this account |
| `--type` | `residential` or `mobile` |
| `--country` | ISO code: `US`, `FR`, `DE`, `TH`… |
| `--region` | State/region slug: `california`, `texas`… |
| `--city` | City slug: `paris`, `dallas`… |
| `--asn` | ISP/carrier ASN number |
| `--session` | Sticky session (any targeting option creates a proxy profile) |
| `--sess-time` | Session duration in minutes (1–10080) |
| `--quota` | Bandwidth limit in bytes (default: 1 GB) |
| `--password` | Custom password (auto-generated if omitted) |

Targeting options (`--type`, `--country`, `--region`, `--city`, `--asn`,
`--session`, `--sess-time`) are saved as a **proxy profile** attached to the
new account — that's where location/session configuration lives in API v1.

---

## 🔁 Session Management

Sessions are locally cached proxy configurations. The `get` command **finds or creates** one and **verifies it live** with a curl test.

```bash
# Find / create / test in one command
anyip get                                    # first account, mobile, SOCKS5
anyip get --residential --location US        # US residential proxy
anyip get --mobile --location FR            # French mobile proxy
anyip get --residential --rotating          # rotating IP (new IP per connection)
anyip get --residential --time 30           # sticky, 30-minute session
anyip get --user 2                          # use proxy account #2
anyip get --list                            # show matches without running curl
```

```bash
# Manage saved sessions
anyip proxy list                    # all saved sessions
anyip proxy list --user 1           # filter by proxy account #1
anyip proxy get <name>              # full detail card
anyip proxy curl <name>             # print the curl test command
anyip proxy curl <name> --run       # execute it
anyip proxy add server:port:user:pass   # import from connection string
anyip proxy import proxies.txt      # bulk import (one per line)
anyip proxy delete <name>           # remove a session
anyip proxy clear                   # wipe all sessions (asks for confirmation)
```

---

## 📊 Traffic & Usage

```bash
anyip traffic list                           # sent/received per day (last 30 days)
anyip traffic list --from 2026-01-01         # filter by start date
anyip traffic list --to   2026-01-31         # filter by end date
anyip traffic list --interval hourly         # hourly resolution (default: daily)
anyip traffic list --proxy <id>              # filter by proxy account (repeatable)
anyip traffic list --json                    # JSON output

anyip traffic usage                          # team quota: used / remaining / accounts
anyip traffic usage --proxy <id>             # one account's usage
anyip traffic usage --json

anyip traffic export                         # print CSV to stdout
anyip traffic export -o traffic.csv          # save to file
anyip traffic export --from 2026-01-01 -o jan.csv
```

---

## 🌍 Geographic Reference Data

Discover valid values for `--country`, `--region`, `--city`, and ASN filtering:

```bash
anyip country                       # all available countries
anyip country --json
anyip region US                     # states/regions for US
anyip region FR --json
anyip asn US                        # ISP/carrier ASNs for US
```

### Cities

The region argument is optional. Given one, the input is matched against that
country's region list, so the display name and the slug both work:

```bash
anyip city US california
anyip city US "New York"            # → newyork
```

Omit it and every region of the country is queried, then listed together:

```bash
$ anyip city US

  Region           City
  Arizona          Phoenix
  California       Los Angeles
  Florida          Miami
  Georgia          Atlanta
  Illinois         Chicago
  New York         New York
  North Carolina   Charlotte
  Pennsylvania     Philadelphia
  Texas            Dallas
  Texas            Houston

  10 cities across 9 of 45 regions — pass the lowercase form, e.g. --region texas --city dallas
```

The region repeats on every row so each line stands alone when grepped. Slugs
are the names lowercased with punctuation stripped, and are printed explicitly
on any row where that does not hold.

City coverage is sparse — most regions return no cities at all (9 of 45 US
states, 3 of 10 French regions). That is the upstream data, not a truncated
result; a region that fails to load is reported separately rather than being
counted as empty.

**`--tags`** (alias `--flag`) emits the
[username attribute](#embedding-options-in-the-username) form instead, one per
line, ready to paste into a proxy username. The country is included because
`region_`/`city_` are only honoured when `country_` is set:

```bash
$ anyip city US texas --tags
country_US,region_texas,city_dallas
country_US,region_texas,city_houston

# drop it straight into a username
$ anyip city US texas --tags | head -1 | xargs -I{} echo "user_$ACCOUNT,type_residential,{}"
user_1234,type_residential,country_US,region_texas,city_dallas
```

**`--json`** returns a flat array with the region on each city; add `--tags`
alongside it to include the same string as a `tag` field:

```bash
anyip city FR --json | jq -r '.[] | "\(.region)/\(.value)"'
```

---

## 🔬 Quick Proxy Test

```bash
anyip check 1     # check proxy account #1 — fetches live IP info via ip-api.com
anyip check 3     # check account #3
```

Output shows the external IP, country, ISP, and city returned through the proxy.

---

## 🤖 AI Proxy Generator

Describe your use case in plain English. Claude analyzes it and **automatically creates the optimal proxy setup** — choosing the right type, country, session strategy, and quota.

```bash
# Inline description
anyip generate "scrape Amazon prices across 5 US cities, rotating IPs"
anyip generate "10 Instagram accounts in France, keep the same IP per account"
anyip generate "mobile proxies in Thailand for social media automation"

# Interactive prompt (no args = Claude asks you)
anyip generate

# Preview the plan without creating anything
anyip generate "SEO rank tracking across 3 countries" --dry-run

# Save the credential list to a file
anyip generate "residential US proxies for scraping" --output proxies.txt
```

### What you get
1. **AI analysis** of your use case
2. **Proxy plan** with count, type, country, session strategy, and quota per group
3. **Rotation strategy** advice
4. **Auto-creation** of all proxy accounts in parallel batches
5. **Local session cache** — immediately usable with `anyip get` and `anyip proxy list`
6. **Credential list** — ready-to-paste `http://user:pass@gate.anyip.io:8080` format

---

## 🌐 Web Dashboard

Prefer a GUI? Launch a local browser interface:

```bash
anyip serve               # opens http://127.0.0.1:3000
anyip serve --port 8080   # custom port
```

Press `Ctrl+C` to stop.

**Dashboard features:**
- 💾 **Saved sessions** — your locally stored proxies load automatically on startup
- 📋 Proxy account table with enable/disable toggles
- ➕ New proxy creation form (HTTP or SOCKS5, sticky or rotating, by country)
- 📈 Stats breakdown by network type, connection type, and location
- 📋 Copy / export proxy strings in any format

---

## 📖 Manual

Built-in static manuals — no API call, no internet required:

```bash
anyip man                    # English
anyip man --language zh      # 中文 (Chinese)
anyip man --language ru      # Русский (Russian)
anyip man --language es      # Español (Spanish)
anyip man --language fr      # Français (French)
anyip man --language Japanese  # any other language — generated via Claude
```

---

## 🔗 Proxy URL Format

```
http://USERNAME:PASSWORD@gate.anyip.io:8080      ← HTTP proxy
socks5://USERNAME:PASSWORD@portal.anyip.io:1080  ← SOCKS5 proxy
```

### Embedding options in the username
anyIP lets you pass connection options directly in the username field (comma-separated):

```
http://user_ACCOUNT,type_residential,country_US,session_my_sess:PASSWORD@gate.anyip.io:8080
```

| Attribute | Values | Description |
|-----------|--------|-------------|
| `user_XXXX` | account ID | proxy account identifier |
| `type_XXX` | `residential` \| `mobile` | network type |
| `country_XX` | ISO code | e.g. `US`, `FR`, `DE` |
| `region_XXX` | region slug | e.g. `california` |
| `city_XXX` | city slug | e.g. `paris` |
| `session_NAME` | any string | sticky session label (omit = rotating) |
| `sesstime_N` | minutes | session duration (e.g. `sesstime_30`) |

---

## 🛠️ Environment Variables

| Variable | Description |
|----------|-------------|
| `ANYIP_API_KEY` | anyIP.io API key — overrides stored config |
| `ANTHROPIC_API_KEY` | Claude API key — overrides stored config |
| `NO_COLOR` | Set to any value to disable colored output |

---

## 💡 Tips & Best Practices

### Scripting & automation
```bash
# Pipe JSON output to jq
anyip account list --json | jq '.[] | {id, username, quota}'
anyip country --json | jq '.[].value'

# Build a proxy username targeting every available city in a country
for tag in $(anyip city US --tags); do
  echo "user_$ACCOUNT,type_residential,$tag"
done

# Use env vars in CI — no config file needed
ANYIP_API_KEY=$SECRET anyip traffic list --json > metrics.json
```

### Proxy strategy guide
| Use case | Recommended flags |
|----------|-------------------|
| Web scraping (stateless) | `--rotating` — new IP per request, fastest |
| Social media accounts | `--session NAME` — one fixed IP per account |
| SEO / rank tracking | `--residential --country XX` |
| Mobile app testing | `--mobile --location XX` |
| High volume scraping | `anyip generate` — auto-sizes quota and count |

### Quota reference
| Amount | Bytes |
|--------|-------|
| 1 GB | `1073741824` |
| 5 GB | `5368709120` |
| 10 GB | `10737418240` |
| 50 GB | `53687091200` |

---

## 🗂️ Project Structure

```
proxy-manager.html        # Web dashboard UI (served by `anyip serve`)
src/
├── index.ts              # CLI entry — wires all commands together
├── api.ts                # anyIP.io REST API client
├── ai.ts                 # Claude AI — plan generation & NL parsing
├── config.ts             # Key storage (Conf) + env var fallback
├── display.ts            # Tables, cards, colors (chalk + cli-table3)
├── sessions.ts           # Local proxy session store (read/write)
├── serve.ts              # HTTP server — API routes + serves proxy-manager.html
├── utils.ts              # ask(), askSecret(), buildPortConfig()
├── commands/
│   ├── account.ts        # anyip account ...
│   ├── config.ts         # anyip config ...
│   ├── data.ts           # anyip country / region / city / asn
│   ├── generate.ts       # anyip generate
│   ├── man.ts            # anyip man
│   ├── proxy.ts          # anyip get / anyip proxy ...
│   ├── serve.ts          # anyip serve
│   └── traffic.ts        # anyip traffic ...
└── manual/
    ├── en.ts             # English (static)
    ├── zh.ts             # Chinese (static)
    ├── ru.ts             # Russian (static)
    ├── es.ts             # Spanish (static)
    └── fr.ts             # French (static)
```

---

## 📋 API Coverage

Uses the anyIP **Public API v1** (team-scoped, `/api/v1/teams/{team_id}/…`). The
team id is resolved automatically from your API key and cached locally.

| Endpoint | CLI command |
|----------|-------------|
| `GET /api/users/me` | `anyip account me` (+ team id discovery) |
| `GET /api/v1/teams/:t/usage` | `anyip account me` / `anyip traffic usage` |
| `GET /api/v1/teams/:t/subscription` | `anyip account me` |
| `GET /api/v1/teams/:t/proxy_accounts` | `anyip account list` |
| `POST /api/v1/teams/:t/proxy_accounts` | `anyip account create` / `anyip generate` |
| `GET /api/v1/teams/:t/proxy_accounts/:id` | `anyip account inspect` |
| `PUT /api/v1/teams/:t/proxy_accounts/:id` | `anyip account enable/disable` |
| `DELETE /api/v1/teams/:t/proxy_accounts/:id` | `anyip account delete` |
| `POST /api/v1/teams/:t/proxy_accounts/:id/reset-quota` | `anyip account reset` |
| `POST /api/v1/teams/:t/proxy_accounts/reset-quota` | `anyip account bulk-reset` |
| `POST /api/v1/teams/:t/proxy_profiles` | `anyip account create` (with targeting options) |
| `GET /api/v1/teams/:t/proxy_accounts/:id/usage` | `anyip traffic usage --proxy` |
| `GET /api/v1/teams/:t/traffic` | `anyip traffic list` / `anyip traffic export` |
| `GET /api/data/country` | `anyip country` |
| `GET /api/data/region/:country` | `anyip region` |
| `GET /api/data/city/:country/:region` | `anyip city` |
| `GET /api/data/asn/:country` | `anyip asn` |

---

## 🏗️ Development

```bash
npm run dev      # run from source with tsx (no build step)
npm run build    # compile with tsup → dist/index.js
npm start        # run the compiled binary
```

Built with: **TypeScript · Commander.js · chalk · ora · cli-table3 · Conf · tsup**
