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
- 🎯 **Target by country, region, city, ASN or GPS point** — and print the
  username flags ready to paste (`--tags`)
- 🌐 **Launch a local web dashboard** if you prefer a GUI — keys, colours,
  and a one-click Change IP on any sticky session
- 📖 **Read the manual in Chinese or Russian** — built-in, no API call needed

---

## 📦 Installation

Not published to npm — install from source:

```bash
git clone https://github.com/cpaka/anyipcli
cd anyipcli
npm install
npm run build
npm link          # makes `anyip` available on your PATH
anyip --help
```

`npm link` symlinks the repo, so `npm run build` after a `git pull` is enough to
update the installed command. To remove it again: `npm unlink -g anyip-cli`.

Prefer not to link? Run it straight from the checkout with `node dist/index.js
<command>`, or `npm run dev -- <command>` to skip the build step.

---

## 🔑 Where to get the keys

| Key | Where |
|-----|-------|
| **anyIP API key** | Sign in at [anyip.io/account](https://anyip.io/account/), then open [Settings → API keys](https://anyip.io/account/settings/api-keys) and create one |
| **Anthropic (Claude) key** *(optional)* | [platform.claude.com → API keys](https://platform.claude.com/settings/workspaces/default/keys) |

The Claude key is only needed for `anyip generate` and for `anyip man` in a
language that has no built-in manual — everything else runs on the anyIP key
alone.

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

Both keys come from a web dashboard — see
[Where to get the keys](#-where-to-get-the-keys) above for the exact pages.

### Option A — Interactive prompt *(recommended — keys stay out of shell history)*
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

### Option D — Dashboard *(GUI — when you would rather not type in a terminal)*

```bash
anyip serve      # or: anyip dashboard / dash / gui
```

Click the ⚙ gear beside **+ New Proxy**, paste each key into the **API keys**
section, then **Save**.

![Settings modal](docs/images/dashboard-settings.png)

| In the modal | What it does |
|--------------|--------------|
| Blank field | Keeps the key already stored — the placeholder shows its last 4 characters |
| 👁 button | Reveals what you are typing, for checking a paste |
| 🗑 button | Marks that key to be **forgotten** on the next Save |
| *Set via environment variable* note | That key comes from `ANYIP_API_KEY` / `ANTHROPIC_API_KEY` and wins over anything saved here — unset the variable if you want the stored key used |

Save applies immediately — no restart. The server reads the stored key on every
request, and the page reloads your account details as soon as the key changes.

**You do not need a key to open the dashboard**, which makes this a workable way
to set up a fresh machine: run `anyip serve`, save both keys, carry on. Until a
key is stored the account bar shows a warning and the Account/Stats tabs stay
empty; the Proxies tab still lists whatever sessions are saved locally.

Only the last four characters of a stored key are ever sent back to the page, and
the file is written owner-only — see [Local Data & Privacy](#-local-data--privacy).

> 🟡 **Environment variables always take priority** over stored config (an
> exported-but-empty variable counts as unset and falls through to the stored key).
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
| `config.json` | `~/Library/Preferences/anyip-cli-nodejs/` · `~/.config/anyip-cli-nodejs/` | API keys, in plain JSON |
| `sessions.json` | same directory | Saved proxy sessions (server, port, username, password) |

These files are **outside the project directory** — git never sees them, and they are never pushed to any repository. There is nothing to add to `.gitignore` for them.

Neither file is encrypted, so the file mode is what protects them: both are written
`0600` and their directory `0700` — owner-only — and the mode is re-applied after
every write, whether it came from the CLI or the dashboard. Treat them like an
SSH private key: anything running as your user can read them, and a backup tool
that copies them carries your keys with it.

**Saving keys from the dashboard** (`anyip serve` → gear → Settings) writes to the
same `config.json` through the local server, so it gets the same treatment. That
server only listens on `127.0.0.1`, only answers requests addressed to a loopback
hostname (so a public page cannot reach it by pointing a domain at `127.0.0.1`),
and never sends a stored key back to the page — the browser only ever sees the
last four characters.

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

`anyip proxy list` shows the same columns as the dashboard's Proxies tab —
account, network, session type, session name, connection, location, age — with
the full proxy string (and last tested IP) on its own line, plus the same
filters and format picker:

```bash
anyip proxy list                          # account · network · type · session · conn · location
anyip proxy list --network mobile         # residential | mobile
anyip proxy list --session sticky         # sticky | rotating
anyip proxy list --search paris           # name, country, region, city, pool, ASN or tag
anyip proxy list --format http            # hostuser | userhost | http | https | socks5
anyip proxy list --json                   # each session plus its `proxy` string
```

```
  #   ACCOUNT      NETWORK  TYPE    SESSION   CONN    LOCATION                            CREATED
  1   user_3c035b  Mobile   Sticky  dced3cd8  SOCKS5  FR · iledefrance · paris · ASN3215  131d ago
      portal.anyip.io:1080:user_3c035b,type_mobile,country_FR,…,session_dced3cd8:••••••   last IP 92.184.97.72
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
anyip near "Eiffel Tower"           # GPS coordinates for a place
```

Every one of them takes **`--tags`** (alias **`--flag`**), which replaces the
listing with the matching [username attributes](#embedding-options-in-the-username),
one self-contained line per row — ready to paste into a proxy username:

| Command | `--tags` output |
|---------|-----------------|
| `anyip country --tags` | `country_FR` |
| `anyip region US --tags` | `country_US,region_texas` |
| `anyip city US texas --tags` | `country_US,region_texas,city_dallas` |
| `anyip asn US --tags` | `country_US,asn_21928` |
| `anyip near paris --tags` | `lat_48.85341,lon_2.3488` |

`region_`/`city_` are only honoured when `country_` is set, so the country code
leads every line.

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

**`--tags`** (alias `--flag`) emits the username-attribute form instead:

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

### Coordinates — `anyip near`

`city`/`region` only cover what anyIP itself exposes. For anything finer, GPS
targeting (`lat_`/`lon_`) asks for the peer closest to a point, and `anyip near`
turns a place name into that pair:

```bash
$ anyip near "Eiffel Tower"

  Place                                 Username flags
  Eiffel Tower, Ile-de-France, France   lat_48.85826,lon_2.2945
  Eiffel Tower, Alberta, Canada         lat_51.3336,lon_-116.235

$ anyip near Paris --country US -n 3 --tags
lat_33.66094,lon_-95.55551
lat_36.302,lon_-88.32671
lat_38.2098,lon_-84.25299
```

| Option | Description |
|--------|-------------|
| `--country <CC>` | keep only matches in that country |
| `-n, --limit <n>` | maximum matches (default 5) |
| `--tags` / `--flag` | print `lat_…,lon_…` only, one per line |
| `--json` | raw geocoder records (adds `tag` with `--tags`) |

Lookups go to [Open-Meteo](https://open-meteo.com/) for populated places and
fall back to [Nominatim](https://nominatim.openstreetmap.org/) for landmarks,
streets and venues — both key-less, the same class of third-party call
`anyip check` already makes against ip-api.com. Coordinates are a best effort:
anyIP returns the closest available peer, not a guaranteed location.

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
1. **AI analysis** of the target and its defences
2. **One recommended setup plus 2–3 alternatives**, each differing in kind — a
   leaner pool, a sticky-session setup for logged-in flows, a mobile/ASN-pinned
   fallback lane — with what it is best for and what it gives up
3. **A flag breakdown table per setup** — every `type_`, `country_`, `region_`,
   `city_`, `asn_`, `pool_`, `session_`, `sesstime_`, `sessreplace_`,
   `sessasn_` flag in that username, and why *this* use case needs it. Whatever
   the table lists is what the generated usernames carry — `pool_` replaces
   `country_`, and sticky sets get their `session_`/`sesstime_` plus any
   `sessreplace_false` / `sessasn_strict` the plan argued for
4. **Rotation strategy** advice for the recommended setup
5. **Auto-creation** of the setup you pick — one **proxy profile** per planned
   proxy, attached to the accounts you already have. Targeting lives on profiles
   in API v1, so a plan does not need (or spend) a new account per proxy; pass
   `--new-accounts` if you do want one fresh account each
6. **Local session cache** — immediately usable with `anyip get` and `anyip proxy list`
7. **Credential list** — ready-to-paste `http://user:pass@gate.anyip.io:8080` format

```
  2)  ALTERNATIVE  Lean single-lane starter pool  (4 proxies · ~12 GB)
     Best for: pilot runs, price-sensitive projects…
     Trade-off: pool_europe gives an unpredictable European country per request…
     Username: user_XXXX,type_residential,pool_europe

     FLAG              VALUE        WHY IT IS THERE
     type_residential  residential  Datacenter exits are blocked on this target's pages…
     pool_europe       europe       Covers UK, DE, FR, NL without an entry per country…
```

You are then asked which setup to create (`1`–`4`, or `n` to cancel); `--dry-run`
prints the comparison and stops. Planning runs on Claude Opus 5 with adaptive
thinking and a schema-enforced response — it is one call per `generate`, billed
to your own Anthropic key.

---

## 🌐 Web Dashboard

Prefer a GUI? `anyip serve` runs a small local server and opens the proxy manager
in your browser — everything it shows comes from the same config and session
store the CLI uses, so the two stay in step.

```bash
anyip serve               # opens http://127.0.0.1:4747
anyip serve --port 8080   # custom port
anyip dashboard           # same command — aliases: dashboard, dash, gui
```

Press `Ctrl+C` to stop. It listens on `127.0.0.1` only and refuses requests that
did not address it by a loopback hostname.

![anyIP Proxy Manager — Proxies tab](docs/images/dashboard-proxies.png)

### The tabs

| Tab | What it shows |
|-----|---------------|
| **Proxies** | Every locally saved proxy, with the badge counting them — the same data as `anyip proxy list` |
| **Account** | Your anyIP account, plan and quota, with enable/disable toggles per proxy account |
| **Stats** | Totals by network type, connection type and location |
| **Manual** | The built-in manual, in any of the five bundled languages |

### The Proxies tab

The toolbar mirrors `anyip proxy list`: a search box (name, country, tag), a
network filter, a session filter, a **Show passwords** toggle, and a format
picker — `host:port:user:pass`, `user:pass@host:port`, `http://`, `https://` or
`socks5://` — which rewrites every row instantly.

Passwords are printed as `*****` until you press **Show passwords**, so the tab
is safe to have open in a shared room or a screen share. **Copy** and
**Export .txt** always hand over the real string regardless of that toggle.

Location shows the country flag (`🇫🇷 FR`), or `🌐 Global` for a proxy with no
country pinned.

Each row carries three actions, in order:

| Button | What it does |
|--------|--------------|
| 📋 Copy | Copies that row's proxy string in the selected format |
| 🔄 Change IP | Rotates a sticky session through its [rotation link](https://anyip.io/docs/guides/sessions-and-rotation) — disabled on rotating rows, which already get a new IP per request |
| 🗑 Delete | Removes the locally saved proxy, after a confirmation. The proxy account itself stays on anyIP |

### Acting on several proxies at once

Tick the checkbox on any row — or the one in the header, which takes everything
the current filters show — and a bar appears with the same actions applied to the
whole selection:

| Button | What it does |
|--------|--------------|
| 📋 Copy | All selected proxy strings, one per line, in the chosen format |
| ⬇ Export .txt | The same list as a downloaded `proxies-YYYY-MM-DD.txt` |
| 🔄 Change IP | Rotates every selected sticky session in parallel; rows that already rotate are skipped and counted in the result |
| 🗑 Delete | Removes them all, behind one confirmation |

The selection survives filtering, searching and format changes, so you can narrow
to `--network mobile`, tick them, widen again, and still act on the same set.

**+ New Proxy** opens the creation form: network type, session type and name,
connection (HTTP / HTTPS / SOCKS5), country, password, quantity and label.

### Settings (⚙)

The gear beside **+ New Proxy** holds two things:

- **API keys** — store or replace the anyIP and Anthropic keys without leaving the
  browser; see [Authentication → Option D](#-authentication) for what each control
  does and how the keys are stored.
- **Appearance** — folded away behind a chevron, with a circle showing the colour
  currently in use; clicking either opens it. Inside: primary colour, tint and
  hover shade, six presets, and a live preview that repaints the page as you pick.
  Tint and hover follow the primary until you set them by hand; *Reset* returns to
  anyIP purple. The palette is saved next to the keys and inlined into the page at
  load, so a customised dashboard paints correctly on the first frame.

> The screenshots above are from a real session; the account email is replaced
> and the passwords are masked by the dashboard itself.

---

## 📖 Manual

`anyip man` also answers to `anyip manual` and `anyip docs`, and takes the
language as a plain word (`anyip manual french`).

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
https://USERNAME:PASSWORD@portal.anyip.io:443    ← HTTPS proxy
socks5://USERNAME:PASSWORD@portal.anyip.io:1080  ← SOCKS5 proxy
```

anyIP answers HTTP, HTTPS and SOCKS5 on the same host — the
[quick start](https://anyip.io/docs/guides/quick-start) gives `portal.anyip.io`
on `1080` or `443` — so the protocol you pick is whichever your client speaks.

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
| `asn_N` | ASN number | e.g. `asn_21928` — pin one ISP/carrier |
| `lat_X,lon_Y` | decimal degrees | closest peer to a point (no `country_` needed) |
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
│   ├── data.ts           # anyip country / region / city / asn / near
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
| `GET /api/proxy_accounts` *(legacy, JSON-LD)* | Change IP button — reads `personal_hash` |
| `GET /api/invalidate/:hash/:session` | Change IP button — rotates a sticky session |

`personal_hash` is only present in the JSON-LD representation, so that one call
asks for `application/ld+json`; the v1 resource exposes no rotation link.

`anyip near` resolves place names through two third-party geocoders rather than
anyIP: [Open-Meteo](https://open-meteo.com/) for populated places, falling back
to [Nominatim](https://nominatim.openstreetmap.org/) for landmarks and
addresses. Both are key-less.

### Local dashboard routes

`anyip serve` exposes its own small API on `127.0.0.1` for the page it serves:

| Route | Purpose |
|-------|---------|
| `GET/PUT /api/settings` | API keys (masked on read) and dashboard palette |
| `GET /api/sessions` · `DELETE /api/sessions/:name` | locally saved proxies |
| `POST /api/sessions/:name/rotate` | Change IP for one sticky session |
| `GET /api/manual?lang=` | built-in manual for the Manual tab |

---

## 🏗️ Development

```bash
npm run dev      # run from source with tsx (no build step)
npm run build    # compile with tsup → dist/index.js
npm start        # run the compiled binary
```

Built with: **TypeScript · Commander.js · chalk · ora · cli-table3 · Conf · tsup**
