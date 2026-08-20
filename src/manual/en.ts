export const EN_MANUAL = `
# anyIP CLI — User Manual

## Overview

anyIP.io provides residential and mobile proxies for web scraping, automation, and data
collection. This CLI lets you manage proxy accounts, monitor bandwidth, create proxy sessions,
and spin up entire proxy setups using plain English — all from your terminal.

Official documentation: https://anyip.io/docs/guides/quick-start

---

## Installation

### Global install (recommended)
    npm install -g anyip-cli
    anyip --help

### From source
    git clone <repo>
    cd anyip-cli
    npm install
    npm run build
    npm link        # makes 'anyip' available globally

### Without installing (one-off use)
    npx anyip-cli <command>

---

## First-Time Setup

### Option A — Interactive prompt (keys are not stored in shell history)
    anyip config set-keys

### Option B — Flags
    anyip config set-keys --anyip YOUR_ANYIP_KEY --claude YOUR_CLAUDE_KEY

### Option C — Environment variables (great for CI/CD)
    export ANYIP_API_KEY=your_anyip_key
    export ANTHROPIC_API_KEY=your_claude_key

Environment variables always take priority over stored config.

Claude key is optional — only required for: anyip generate, anyip man (non-English)

### View stored config
    anyip config show          # shows masked keys + config file path

### Clear stored config
    anyip config clear

---

## Account Management

    anyip account              # list all proxy accounts (table view)
    anyip account me           # show your anyIP account info & quota
    anyip account list         # alias for the above table
    anyip account list --json  # machine-readable JSON output
    anyip account inspect <id>             # full detail card for one account
    anyip account inspect <id> --json      # JSON output
    anyip account create -d "My proxy" --type residential --country US
    anyip account enable <id>
    anyip account disable <id>
    anyip account bulk-reset               # reset all bandwidth quotas (asks for confirmation)
    anyip account bulk-reset --yes         # skip confirmation (for scripts)

### Create options
    -d, --description <text>   Required. Label for this proxy account
    --type <type>              residential | mobile
    --country <code>           ISO code, e.g. US, FR, DE, TH
    --region <name>            State or region (lowercase), e.g. california
    --city <name>              City (lowercase), e.g. paris
    --session <name>           Sticky session name (alphanumeric + underscore)
    --sess-time <minutes>      Session duration 1–10080 (default: 7 days)
    --quota <bytes>            Bandwidth limit in bytes (default: 1 GB = 1073741824)
    --password <pass>          Custom password (auto-generated if omitted)

---

## Session Management

Sessions are locally-saved proxy connection configurations. The \`get\` command finds or
creates one and tests it with a live curl check.

### Find / create / test a proxy session
    anyip get                                    # use first proxy account, mobile, socks5
    anyip get --residential --location US        # US residential proxy
    anyip get --mobile --location FR             # French mobile proxy
    anyip get --residential --rotating           # rotating IP (new IP per connection)
    anyip get --residential --time 30            # sticky, 30-minute session
    anyip get --user 2                           # use proxy account #2 (from: anyip account)
    anyip get --list                             # show matching sessions without curling

### Manage saved sessions
    anyip proxy list                  # account, network, type, session, conn, location
    anyip proxy list --network mobile # residential | mobile
    anyip proxy list --session sticky # sticky | rotating
    anyip proxy list --search paris   # name, country, region, city, pool, ASN or tag
    anyip proxy list --format http    # hostuser | userhost | http | https | socks5
    anyip proxy list --user 1         # sessions belonging to proxy account #1
    anyip proxy get <name>            # full detail card for a session
    anyip proxy curl <name>           # print the curl test command
    anyip proxy curl <name> --run     # execute the curl test
    anyip proxy add server:port:username:password   # import from connection string
    anyip proxy import proxies.txt    # bulk import (one connection string per line)
    anyip proxy delete <name>         # delete a saved session
    anyip proxy clear                 # delete all saved sessions (asks for confirmation)

---

## Traffic Monitoring

    anyip traffic list                            # sent/received per day (last 30 days)
    anyip traffic list --interval hourly          # hourly resolution
    anyip traffic usage                           # team quota: used / remaining
    anyip traffic list --from 2024-01-01          # filter by start date
    anyip traffic list --to 2024-01-31            # filter by end date
    anyip traffic list --proxy <id>               # filter by proxy account ID
    anyip traffic list --json                     # JSON output
    anyip traffic export                          # print CSV to stdout
    anyip traffic export -o traffic.csv           # save to file
    anyip traffic export --from 2024-01-01 -o jan.csv

---

## Geographic Reference Data

    anyip country                      # all available countries
    anyip country --json               # JSON output
    anyip region US                    # regions/states available for US
    anyip region FR --json
    anyip city US california           # cities in a region (name or slug)
    anyip city FR                      # every city in a country, by region
    anyip city US --tags               # country_US,region_texas,city_dallas (username flags)
    anyip asn US                       # ISP/carrier ASNs for US
    anyip near "Eiffel Tower"          # GPS coordinates for a place
    anyip near Paris --country US -n 3 # keep only US matches
    anyip near paris --tags            # lat_48.85341,lon_2.3488

Use these to discover valid values for --country, --region, --city, and ASN
filtering.

--tags (alias --flag) works on country, region, city, asn and near: it prints
the proxy username flags instead of the listing, one per line. The country code
leads every line because region_/city_ are ignored without country_.

---

## Quick Proxy Check

    anyip check 1     # check proxy account #1 — fetches IP info via ip-api.com

---

## AI Proxy Generator

Describe your use case in plain English. Claude analyzes it and creates the optimal
set of proxy accounts automatically.

    # Describe inline
    anyip generate "scrape Amazon prices across 5 US cities, rotating IPs"

    # Interactive prompt (no args = asks for description)
    anyip generate

    # Preview the plan without creating anything
    anyip generate "10 Instagram accounts in France, sticky sessions" --dry-run

    # Save credential list to file
    anyip generate "residential US proxies for SEO monitoring" --output proxies.txt
    anyip generate "..." --new-accounts   # one new account per proxy (default: reuse)

Proxies are created as proxy *profiles* on the accounts you already have — in API v1
the targeting lives on profiles, so a plan does not spend one account per proxy. Use
--new-accounts if you really want a fresh account each.

You get one recommended setup plus 2-3 alternatives (a leaner pool, sticky sessions
for logged-in flows, a mobile/ASN fallback lane…), each with a table breaking down
every username flag it uses and why the use case needs it. Pick one at the prompt —
or use --dry-run to just compare them.

The generator also saves all created sessions locally so you can immediately use
\`anyip get\` or \`anyip proxy list\` to work with them.

---

## Web Dashboard

Launch a local browser GUI to manage proxies visually:

    anyip serve               # opens http://127.0.0.1:3000 in your browser
    anyip serve --port 8080   # custom port
    anyip dashboard           # same command — aliases: dashboard, dash, gui

Press Ctrl+C to stop the server. The dashboard includes:
- Account list with enable/disable toggles
- AI proxy generator form
- Traffic overview
- Session viewer
- Change IP button on every sticky row (rotation link)
- Settings (gear, next to + New Proxy): API keys and dashboard colours

---

## Manual

    anyip man                  # show this manual (English)
    anyip manual french        # same command — aliases: manual, docs
    anyip docs es              # language as a plain word or code
    anyip man --fr             # French (Français)
    anyip man --es             # Spanish (Español)
    anyip man --zh             # Chinese (中文)
    anyip man --ru             # Russian (Русский)
    anyip man --language ja    # any other language via Claude

---

## Proxy URL Format

    http://USERNAME:PASSWORD@gate.anyip.io:8080      (HTTP proxy)
    https://USERNAME:PASSWORD@portal.anyip.io:443    (HTTPS proxy)
    socks5://USERNAME:PASSWORD@portal.anyip.io:1080  (SOCKS5 proxy)

All three protocols answer on the same host — pick whichever your client speaks.

With session attributes embedded in the username:

    http://user_ACCOUNT,type_residential,country_US,session_my_sess:PASSWORD@gate.anyip.io:8080

Attributes (comma-separated in the username field):
    user_XXXX       proxy account identifier
    type_XXX        residential | mobile
    country_XX      ISO country code
    region_XXX      region/state slug
    city_XXX        city slug
    asn_N           pin one ISP/carrier (see: anyip asn)
    lat_X,lon_Y     closest peer to a GPS point (see: anyip near)
    session_NAME    sticky session label (omit for rotating)
    sesstime_N      session duration in minutes

---

## Environment Variables

    ANYIP_API_KEY        anyIP.io API key (overrides stored config)
    ANTHROPIC_API_KEY    Claude API key (overrides stored config)
    NO_COLOR             set to any value to disable colored output

---

## Tips

- Use \`--json\` on any data command to pipe output: \`anyip account list --json | jq '.[].username'\`
- The \`anyip get\` command remembers sessions locally — run it once, reuse the session
- For scraping: use \`--rotating\` (new IP per connection, fastest for stateless tasks)
- For account management: use \`--session NAME\` to lock one IP per account
- For CI/CD: set \`ANYIP_API_KEY\` as a secret, skip \`anyip config set-keys\`
- Quota in bytes: 1 GB = 1073741824, 5 GB = 5368709120, 10 GB = 10737418240
`;
