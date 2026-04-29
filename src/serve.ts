import http from "node:http";
import { URL } from "node:url";
import { exec } from "node:child_process";
import { config } from "./config.js";
import * as api from "./api.js";
import * as sessions from "./sessions.js";
import { generateProxyPlan } from "./ai.js";
import type { ProxyPlanItem } from "./ai.js";
import chalk from "chalk";

function getStoredKeys() {
  return {
    anyipKey: config.get("anyipKey") ?? "",
    claudeKey: config.get("claudeKey") ?? "",
  };
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function json(res: http.ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const base = `http://127.0.0.1`;
  const url = new URL(req.url ?? "/", base);
  const path = url.pathname;
  const method = req.method ?? "GET";

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const { anyipKey, claudeKey } = getStoredKeys();

  try {
    if (path === "/" && method === "GET") {
      const html = buildHtml();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (path === "/api/me" && method === "GET") {
      return json(res, 200, await api.getMe(anyipKey));
    }

    if (path === "/api/proxies" && method === "GET") {
      const data = await api.listProxies(anyipKey, {
        page: url.searchParams.get("page") ?? "1",
        itemsPerPage: url.searchParams.get("limit") ?? "50",
      });
      return json(res, 200, data);
    }

    if (path === "/api/proxies" && method === "POST") {
      const body = await readBody(req);
      const proxy = await api.createProxy(anyipKey, body as api.CreateProxyPayload);
      return json(res, 201, proxy);
    }

    const proxyMatch = path.match(/^\/api\/proxies\/(.+)$/);
    if (proxyMatch && method === "PUT") {
      const body = await readBody(req);
      const proxy = await api.updateProxy(anyipKey, proxyMatch[1], body as Partial<api.CreateProxyPayload>);
      return json(res, 200, proxy);
    }

    if (path === "/api/traffic" && method === "GET") {
      const params: Parameters<typeof api.listTraffic>[1] = {};
      const after = url.searchParams.get("date[after]") ?? url.searchParams.get("dateFrom");
      const before = url.searchParams.get("date[before]") ?? url.searchParams.get("dateTo");
      const proxy = url.searchParams.get("proxy_account") ?? url.searchParams.get("proxyAccount");
      if (after)  params["date[after]"]  = after;
      if (before) params["date[before]"] = before;
      if (proxy)  params["proxy_account"] = proxy;
      return json(res, 200, await api.listTraffic(anyipKey, params));
    }

    if (path === "/api/countries" && method === "GET") {
      return json(res, 200, await api.getCountries(anyipKey));
    }

    if (path === "/api/generate" && method === "POST") {
      const body = (await readBody(req)) as { description: string };
      const plan = await generateProxyPlan(claudeKey, body.description);
      return json(res, 200, plan);
    }

    if (path === "/api/sessions" && method === "GET") {
      return json(res, 200, { sessions: sessions.listSessions() });
    }

    if (path === "/api/generate/execute" && method === "POST") {
      const body = (await readBody(req)) as { plan: ProxyPlanItem[] };
      const created: api.ProxyAccount[] = [];
      for (const item of body.plan) {
        for (let i = 1; i <= item.count; i++) {
          const portConfig: api.PortConfig = {};
          if (item.type) portConfig.type = item.type;
          if (item.country) portConfig.country = item.country;
          if (item.region) portConfig.region = item.region;
          if (!item.rotating && item.session_prefix)
            portConfig.session = `${item.session_prefix}_${i}`;
          if (item.sess_time != null) portConfig.sess_time = item.sess_time;

          const payload: api.CreateProxyPayload = {
            description: `${item.description} #${i}`,
            enabled: true,
            quota: item.quota_bytes,
            ip_whitelist: {
              ips: [],
              ports: Object.keys(portConfig).length > 0 ? [portConfig] : [],
              is_enabled: false,
            },
          };
          const proxy = await api.createProxy(anyipKey, payload);
          created.push(proxy);
        }
      }
      return json(res, 200, { created });
    }

    json(res, 404, { error: "Not found" });
  } catch (err) {
    json(res, 500, { error: String(err) });
  }
}

export async function startServer(port: number): Promise<void> {
  const server = http.createServer(handleRequest);

  await new Promise<void>((resolve, reject) => {
    server.listen(port, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const url = `http://127.0.0.1:${port}`;
  console.log(`\n  ${chalk.bold.cyan("⬡  anyIP Dashboard")}  ${chalk.dim(`— ${url}`)}\n`);
  console.log(`  ${chalk.dim("Press Ctrl+C to stop")}\n`);

  const openCmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
      ? "start"
      : "xdg-open";
  exec(`${openCmd} ${url}`);

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      server.close();
      console.log(chalk.dim("\n  Server stopped.\n"));
      resolve();
    });
  });
}

// ── Embedded HTML ──────────────────────────────────────────────────────────────

function buildHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>anyIP Dashboard</title>
<style>
:root{
  --bg:#0d1117;--surface:#161b22;--surface2:#1c2128;--border:#30363d;
  --text:#e6edf3;--dim:#8b949e;--accent:#39d5d4;--blue:#58a6ff;
  --green:#3fb950;--red:#f85149;--yellow:#d29922;--orange:#f0883e;
  --radius:6px;--font:'SF Mono','Fira Code',monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:system-ui,sans-serif;font-size:14px;min-height:100vh}
a{color:var(--accent);text-decoration:none}

/* ── Header ── */
header{
  background:var(--surface);border-bottom:1px solid var(--border);
  padding:0 24px;height:56px;display:flex;align-items:center;gap:24px;
  position:sticky;top:0;z-index:100;
}
.logo{font-size:18px;font-weight:700;color:var(--accent);letter-spacing:-0.5px}
.logo span{color:var(--dim);font-weight:400}
#account-strip{margin-left:auto;display:flex;gap:16px;align-items:center;font-size:13px;color:var(--dim)}
#account-strip strong{color:var(--text)}

/* ── Nav ── */
nav{
  background:var(--surface);border-bottom:1px solid var(--border);
  padding:0 24px;display:flex;gap:0;
}
.nav-btn{
  background:none;border:none;color:var(--dim);cursor:pointer;
  padding:14px 18px;font-size:14px;border-bottom:2px solid transparent;
  transition:color .15s,border-color .15s;
}
.nav-btn:hover{color:var(--text)}
.nav-btn.active{color:var(--accent);border-bottom-color:var(--accent)}

/* ── Main ── */
main{max-width:1200px;margin:0 auto;padding:24px}
.tab{display:none}.tab.active{display:block}

/* ── Toolbar ── */
.toolbar{display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
.toolbar-right{margin-left:auto;display:flex;gap:8px}

/* ── Buttons ── */
.btn{
  background:var(--surface2);border:1px solid var(--border);color:var(--text);
  padding:6px 14px;border-radius:var(--radius);cursor:pointer;font-size:13px;
  transition:background .15s,border-color .15s;
}
.btn:hover{background:var(--surface);border-color:var(--dim)}
.btn-primary{background:var(--accent);border-color:var(--accent);color:#0d1117;font-weight:600}
.btn-primary:hover{opacity:.9}
.btn-sm{padding:3px 10px;font-size:12px}
.btn-danger{background:transparent;border-color:var(--red);color:var(--red)}
.btn-danger:hover{background:rgba(248,81,73,.1)}
.btn-success{background:transparent;border-color:var(--green);color:var(--green)}
.btn-success:hover{background:rgba(63,185,80,.1)}

/* ── Tables ── */
.table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{
  background:var(--surface2);color:var(--dim);font-weight:500;
  padding:10px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;
}
td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,.02)}
.mono{font-family:var(--font);font-size:12px;color:var(--dim)}
.actions{display:flex;gap:6px}

/* ── Badges ── */
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;letter-spacing:.3px}
.badge-active{background:rgba(63,185,80,.15);color:var(--green)}
.badge-disabled{background:rgba(139,148,158,.1);color:var(--dim)}
.badge-blocked{background:rgba(248,81,73,.15);color:var(--red)}
.badge-inactive{background:rgba(210,153,34,.15);color:var(--yellow)}

/* ── Forms ── */
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.form-group{display:flex;flex-direction:column;gap:6px}
.form-group.full{grid-column:1/-1}
label{font-size:12px;color:var(--dim);font-weight:500}
input,select,textarea{
  background:var(--surface2);border:1px solid var(--border);color:var(--text);
  padding:8px 10px;border-radius:var(--radius);font-size:13px;width:100%;
  transition:border-color .15s;
}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent)}
input[type=number]{-moz-appearance:textfield}

/* ── Modal ── */
.modal-overlay{
  position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;
  display:flex;align-items:center;justify-content:center;
}
.modal-overlay.hidden{display:none}
.modal{
  background:var(--surface);border:1px solid var(--border);border-radius:10px;
  width:520px;max-width:95vw;max-height:90vh;overflow-y:auto;
}
.modal-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:16px 20px;border-bottom:1px solid var(--border);
}
.modal-header h3{font-size:16px;font-weight:600}
.modal-close{background:none;border:none;color:var(--dim);font-size:20px;cursor:pointer;padding:0 4px}
.modal-close:hover{color:var(--text)}
.modal-body{padding:20px}
.modal-footer{padding:16px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px}

/* ── Proxy URL box ── */
.proxy-url{
  background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);
  padding:10px 12px;font-family:var(--font);font-size:12px;color:var(--green);
  display:flex;align-items:center;justify-content:space-between;gap:8px;word-break:break-all;
}

/* ── Traffic ── */
.traffic-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.section-title{font-size:15px;font-weight:600;color:var(--text);margin:24px 0 12px}

/* ── AI Generator ── */
.gen-header{margin-bottom:20px}
.gen-header h2{font-size:20px;font-weight:700;margin-bottom:6px}
.gen-header p{color:var(--dim);line-height:1.5}
#usecase-input{
  width:100%;height:110px;resize:vertical;font-family:system-ui,sans-serif;
  font-size:14px;line-height:1.6;margin-bottom:12px;
}
.example-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.chip{
  background:var(--surface2);border:1px solid var(--border);color:var(--dim);
  padding:5px 12px;border-radius:16px;cursor:pointer;font-size:12px;
  transition:all .15s;
}
.chip:hover{border-color:var(--accent);color:var(--accent)}

/* ── Plan cards ── */
.plan-analysis{
  background:var(--surface2);border:1px solid var(--border);border-left:3px solid var(--accent);
  border-radius:var(--radius);padding:14px 16px;margin:16px 0;line-height:1.6;color:var(--text);
}
.plan-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:16px 0}
.plan-card{
  background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;
}
.plan-card-title{font-weight:600;margin-bottom:8px;color:var(--text)}
.plan-card-meta{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dim)}
.plan-card-meta span{display:flex;align-items:center;gap:6px}
.plan-card-count{
  margin-top:10px;font-size:18px;font-weight:700;color:var(--accent);
}
.plan-card-count span{font-size:12px;font-weight:400;color:var(--dim)}
.plan-note{
  background:rgba(88,166,255,.07);border:1px solid rgba(88,166,255,.2);
  border-radius:var(--radius);padding:8px 12px;font-size:12px;color:var(--blue);
  margin-top:8px;line-height:1.4;
}
.plan-actions{display:flex;gap:8px;align-items:center;margin-top:16px}
.plan-summary{color:var(--dim);font-size:13px}

/* ── Result list ── */
.result-header{
  display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;
}
.result-list{
  background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);
  padding:16px;font-family:var(--font);font-size:12px;line-height:1.8;
  white-space:pre-wrap;word-break:break-all;max-height:400px;overflow-y:auto;
}
.result-group-header{color:var(--accent);font-weight:600}
.result-comment{color:var(--dim)}
.result-url{color:var(--green)}

/* ── Toast ── */
.toast{
  position:fixed;bottom:24px;right:24px;padding:10px 18px;border-radius:var(--radius);
  font-size:13px;font-weight:500;z-index:999;animation:fadeIn .2s ease;
}
.toast.hidden{display:none}
.toast-ok{background:rgba(63,185,80,.9);color:#fff}
.toast-err{background:rgba(248,81,73,.9);color:#fff}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* ── Empty state ── */
.empty{text-align:center;padding:48px 24px;color:var(--dim)}
.empty svg{opacity:.3;margin-bottom:12px}

/* ── Loading ── */
.loading{display:flex;align-items:center;gap:8px;color:var(--dim);padding:24px}
.spinner{width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>

<header>
  <div class="logo">⬡ anyIP <span>Dashboard</span></div>
  <div id="account-strip"><span class="spinner"></span> Loading...</div>
</header>

<nav>
  <button class="nav-btn active" data-tab="proxies">Proxies</button>
  <button class="nav-btn" data-tab="sessions">Sessions</button>
  <button class="nav-btn" data-tab="traffic">Traffic</button>
  <button class="nav-btn" data-tab="generate">AI Generator</button>
</nav>

<main>
  <!-- PROXIES TAB -->
  <div id="tab-proxies" class="tab active">
    <div class="toolbar">
      <button class="btn" onclick="loadProxies()">↻ Refresh</button>
      <div class="toolbar-right">
        <button class="btn btn-primary" onclick="openModal()">+ New Proxy</button>
      </div>
    </div>
    <div id="proxies-container"><div class="loading"><div class="spinner"></div>Loading proxies...</div></div>
  </div>

  <!-- SESSIONS TAB -->
  <div id="tab-sessions" class="tab">
    <div class="toolbar">
      <button class="btn" onclick="loadSessions()">↻ Refresh</button>
    </div>
    <div id="sessions-container"><div class="loading"><div class="spinner"></div>Loading sessions...</div></div>
  </div>

  <!-- TRAFFIC TAB -->
  <div id="tab-traffic" class="tab">
    <div class="traffic-filters">
      <label style="color:var(--dim);font-size:13px">From</label>
      <input type="date" id="t-from" style="width:150px">
      <label style="color:var(--dim);font-size:13px">To</label>
      <input type="date" id="t-to" style="width:150px">
      <input type="text" id="t-proxy" placeholder="Proxy ID (optional)" style="width:200px">
      <button class="btn btn-primary" onclick="loadTraffic()">Filter</button>
      <button class="btn" onclick="document.getElementById('t-from').value='';document.getElementById('t-to').value='';document.getElementById('t-proxy').value='';loadTraffic()">Clear</button>
    </div>
    <div id="traffic-container"><div class="loading"><div class="spinner"></div>Loading traffic...</div></div>
    <div class="section-title">Top Domains</div>
    <div id="domains-container"><div class="loading"><div class="spinner"></div>Loading...</div></div>
  </div>

  <!-- AI GENERATOR TAB -->
  <div id="tab-generate" class="tab">
    <div class="gen-header">
      <h2>AI Proxy Generator</h2>
      <p>Describe your use case in plain language. Claude will analyze it and recommend the optimal proxy configuration, then create all proxies for you.</p>
    </div>
    <textarea id="usecase-input" placeholder="Example: I need to scrape product prices from Amazon in the US, UK, and Germany — about 50,000 requests per day per market. Anti-bot measures are strict."></textarea>
    <div class="example-chips">
      <span class="chip" onclick="setExample('Scrape product prices from Amazon US, UK and Germany, 50k requests/day per market, strict anti-bot')">Amazon Price Scraping</span>
      <span class="chip" onclick="setExample('Instagram automation for 20 accounts — need sticky IPs, one per account, in the US')">Instagram Automation</span>
      <span class="chip" onclick="setExample('SEO rank tracking for 100 keywords across US, UK, Australia and Canada, 10k checks/day')">SEO Rank Tracking</span>
      <span class="chip" onclick="setExample('Monitor sneaker drops on Nike and StockX from US mobile IPs, fast rotation needed')">Sneaker Monitoring</span>
      <span class="chip" onclick="setExample('Collect hotel pricing data from Booking.com across 10 European countries')">Travel Data Scraping</span>
    </div>
    <button class="btn btn-primary" id="gen-btn" onclick="generatePlan()" style="font-size:15px;padding:10px 24px">Generate Plan with AI</button>
    <div id="plan-container"></div>
  </div>
</main>

<!-- CREATE PROXY MODAL -->
<div id="modal-overlay" class="modal-overlay hidden">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <h3>New Proxy Account</h3>
      <button class="modal-close" onclick="closeModal()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full">
          <label>Description *</label>
          <input type="text" id="f-desc" placeholder="e.g. US Residential for Instagram">
        </div>
        <div class="form-group">
          <label>Type</label>
          <select id="f-type">
            <option value="">Any</option>
            <option value="residential">Residential</option>
            <option value="mobile">Mobile (4G/5G)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Country (ISO code)</label>
          <input type="text" id="f-country" placeholder="US, FR, DE, RU, CN..." maxlength="2">
        </div>
        <div class="form-group">
          <label>Region / State</label>
          <input type="text" id="f-region" placeholder="california, texas...">
        </div>
        <div class="form-group">
          <label>City</label>
          <input type="text" id="f-city" placeholder="paris, berlin...">
        </div>
        <div class="form-group">
          <label>Sticky Session Name</label>
          <input type="text" id="f-session" placeholder="Leave empty = rotating">
        </div>
        <div class="form-group">
          <label>Session Duration (min)</label>
          <input type="number" id="f-sesstime" placeholder="Default: 10080 (7 days)">
        </div>
        <div class="form-group">
          <label>Quota (GB)</label>
          <input type="number" id="f-quota" value="1" min="0.1" step="0.1">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitCreate()">Create Proxy</button>
    </div>
  </div>
</div>

<!-- PROXY DETAIL MODAL -->
<div id="detail-overlay" class="modal-overlay hidden">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <h3>Proxy Details</h3>
      <button class="modal-close" onclick="closeDetail()">&#x2715;</button>
    </div>
    <div class="modal-body" id="detail-body"></div>
    <div class="modal-footer">
      <button class="btn" onclick="closeDetail()">Close</button>
    </div>
  </div>
</div>

<div id="toast" class="toast hidden"></div>

<script>
(function() {
  // ── Tab navigation ──────────────────────────────────────────────────────────
  document.querySelectorAll('.nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = this.dataset.tab;
      document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      document.getElementById('tab-' + tab).classList.add('active');
      if (tab === 'traffic') { loadTraffic(); loadTopDomains(); }
      if (tab === 'sessions') { loadSessions(); }
    });
  });

  // ── Toast ───────────────────────────────────────────────────────────────────
  function toast(msg, type) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast ' + (type === 'error' ? 'toast-err' : 'toast-ok');
    clearTimeout(el._t);
    el._t = setTimeout(function() { el.className = 'toast hidden'; }, 3000);
  }
  window.toast = toast;

  // ── Formatters ──────────────────────────────────────────────────────────────
  function fmtBytes(b) {
    if (!b) return '0 B';
    var u = ['B','KB','MB','GB','TB'], i = 0, v = b;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(2) + ' ' + u[i];
  }
  function badge(proxy) {
    if (!proxy.enabled) return '<span class="badge badge-disabled">DISABLED</span>';
    if (proxy.is_active === false) return '<span class="badge badge-inactive">INACTIVE</span>';
    if (proxy.status === 'ACCOUNT_BLOCKED') return '<span class="badge badge-blocked">BLOCKED</span>';
    return '<span class="badge badge-active">ACTIVE</span>';
  }

  // ── Account info ─────────────────────────────────────────────────────────────
  function loadAccount() {
    fetch('/api/me').then(function(r) { return r.json(); }).then(function(u) {
      document.getElementById('account-strip').innerHTML =
        '<strong>' + (u.email || u.username || '—') + '</strong>' +
        '<span>Quota: ' + fmtBytes(u.quota) + '</span>' +
        '<span>Used: ' + fmtBytes(u.consumption) + '</span>';
    }).catch(function() {
      document.getElementById('account-strip').innerHTML = '<span style="color:var(--red)">&#x26A0; No API key configured</span>';
    });
  }

  // ── Proxies ─────────────────────────────────────────────────────────────────
  function loadProxies() {
    var el = document.getElementById('proxies-container');
    el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading proxies...</div>';
    fetch('/api/proxies?limit=50').then(function(r) { return r.json(); }).then(function(data) {
      var members = data.members || [];
      if (!members.length) {
        el.innerHTML = '<div class="empty">No proxy accounts yet.<br>Click <strong>+ New Proxy</strong> to create one.</div>';
        return;
      }
      var rows = members.map(function(p) {
        return '<tr>' +
          '<td class="mono">' + p.id.slice(-8) + '</td>' +
          '<td class="mono" style="color:var(--yellow)">' + (p.username || '—') + '</td>' +
          '<td>' + (p.description || '—') + '</td>' +
          '<td>' + badge(p) + '</td>' +
          '<td>' + fmtBytes(p.quota) + '</td>' +
          '<td>' + fmtBytes(p.consumption) + '</td>' +
          '<td><div class="actions">' +
            '<button class="btn btn-sm" onclick="showDetail(\'' + p.id + '\')">Details</button>' +
            (p.enabled
              ? '<button class="btn btn-sm btn-danger" onclick="setEnabled(\'' + p.id + '\',false)">Disable</button>'
              : '<button class="btn btn-sm btn-success" onclick="setEnabled(\'' + p.id + '\',true)">Enable</button>') +
          '</div></td>' +
          '</tr>';
      }).join('');
      el.innerHTML =
        '<div class="table-wrap"><table>' +
        '<thead><tr><th>ID</th><th>Username</th><th>Description</th><th>Status</th><th>Quota</th><th>Used</th><th>Actions</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
        '<div style="color:var(--dim);font-size:12px;margin-top:8px;padding:0 4px">' + members.length + ' of ' + data.total + ' proxies</div>';
    }).catch(function(e) {
      el.innerHTML = '<div class="empty" style="color:var(--red)">Error: ' + e + '</div>';
    });
  }

  window.setEnabled = function(id, enabled) {
    fetch('/api/proxies/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enabled })
    }).then(function() {
      toast(enabled ? 'Proxy enabled' : 'Proxy disabled', 'ok');
      loadProxies();
    }).catch(function(e) { toast('Error: ' + e, 'error'); });
  };

  var _proxiesCache = {};
  window.showDetail = function(id) {
    fetch('/api/proxies').then(function(r) { return r.json(); }).then(function(data) {
      var p = (data.members || []).find(function(x) { return x.id === id; });
      if (!p) { toast('Proxy not found', 'error'); return; }
      var ports = (p.ip_whitelist && p.ip_whitelist.ports) || [];
      var portInfo = ports.map(function(pc) {
        var parts = [];
        if (pc.type) parts.push('<strong>' + pc.type + '</strong>');
        if (pc.country) parts.push('country=' + pc.country);
        if (pc.region) parts.push('region=' + pc.region);
        if (pc.city) parts.push('city=' + pc.city);
        if (pc.session) parts.push('session=' + pc.session);
        if (pc.sess_time) parts.push('sesstime=' + pc.sess_time + 'min');
        return parts.join(' &nbsp; ');
      }).join('<br>') || '<span style="color:var(--dim)">No port config (rotating)</span>';

      var proxyUrl = (p.username && p.plain_password)
        ? 'http://' + p.username + ':' + p.plain_password + '@gate.anyip.io:8080'
        : null;

      document.getElementById('detail-body').innerHTML =
        '<div class="form-grid">' +
        row('ID', '<span class="mono">' + p.id + '</span>') +
        row('Username', '<span style="color:var(--yellow)">' + (p.username || '—') + '</span>') +
        row('Status', badge(p)) +
        row('Quota', fmtBytes(p.quota)) +
        row('Used', fmtBytes(p.consumption)) +
        row('Recv / Sent', fmtBytes(p.bytes_recv) + ' / ' + fmtBytes(p.bytes_sent)) +
        '</div>' +
        '<div style="margin-top:16px"><label style="color:var(--dim);font-size:12px">Port Config</label><div style="margin-top:6px;font-size:13px">' + portInfo + '</div></div>' +
        (proxyUrl
          ? '<div style="margin-top:16px"><label style="color:var(--dim);font-size:12px">Proxy URL</label>' +
            '<div class="proxy-url" style="margin-top:6px">' + proxyUrl +
            '<button class="btn btn-sm" onclick="copyText(\'' + proxyUrl + '\')">Copy</button></div></div>'
          : '<div style="margin-top:12px;color:var(--dim);font-size:12px">&#x2139; Password shown only at creation time</div>');
      document.getElementById('detail-overlay').classList.remove('hidden');
    });
  };

  function row(label, val) {
    return '<div class="form-group"><label>' + label + '</label><div style="padding:8px 0;font-size:13px">' + val + '</div></div>';
  }

  window.closeDetail = function() {
    document.getElementById('detail-overlay').classList.add('hidden');
  };
  document.getElementById('detail-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeDetail();
  });

  // ── Create Proxy Modal ────────────────────────────────────────────────────────
  window.openModal = function() {
    document.getElementById('modal-overlay').classList.remove('hidden');
  };
  window.closeModal = function() {
    document.getElementById('modal-overlay').classList.add('hidden');
  };
  document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  window.submitCreate = function() {
    var desc = document.getElementById('f-desc').value.trim();
    if (!desc) { toast('Description is required', 'error'); return; }
    var portConfig = {};
    var t = document.getElementById('f-type').value;
    var c = document.getElementById('f-country').value.trim().toUpperCase();
    var r = document.getElementById('f-region').value.trim().toLowerCase();
    var ci = document.getElementById('f-city').value.trim().toLowerCase();
    var s = document.getElementById('f-session').value.trim();
    var st = document.getElementById('f-sesstime').value;
    if (t) portConfig.type = t;
    if (c) portConfig.country = c;
    if (r) portConfig.region = r;
    if (ci) portConfig.city = ci;
    if (s) portConfig.session = s;
    if (st) portConfig.sess_time = parseInt(st);
    var quota = parseFloat(document.getElementById('f-quota').value || '1') * 1073741824;
    var payload = {
      description: desc,
      enabled: true,
      quota: Math.round(quota),
      ip_whitelist: { ips: [], ports: Object.keys(portConfig).length ? [portConfig] : [], is_enabled: false }
    };
    fetch('/api/proxies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); }).then(function(p) {
      closeModal();
      toast('Proxy created: ' + (p.username || p.id), 'ok');
      loadProxies();
      if (p.username && p.plain_password) {
        setTimeout(function() {
          showDetail(p.id);
        }, 400);
      }
    }).catch(function(e) { toast('Error: ' + e, 'error'); });
  };

  // ── Traffic ─────────────────────────────────────────────────────────────────
  window.loadTraffic = function() {
    var el = document.getElementById('traffic-container');
    el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
    var params = new URLSearchParams();
    var from = document.getElementById('t-from').value;
    var to = document.getElementById('t-to').value;
    var proxy = document.getElementById('t-proxy').value.trim();
    if (from) params.set('dateFrom', from);
    if (to) params.set('dateTo', to);
    if (proxy) params.set('proxyAccount', proxy);
    fetch('/api/traffic?' + params.toString()).then(function(r) { return r.json(); }).then(function(data) {
      var items = (data.members || []).slice(0, 100);
      if (!items.length) { el.innerHTML = '<div class="empty">No traffic data.</div>'; return; }
      var rows = items.map(function(t) {
        return '<tr><td class="mono">' + (t.date || '—') + '</td>' +
          '<td>' + (t.domain || '—') + '</td>' +
          '<td>' + fmtBytes(t.bytes_recv) + '</td>' +
          '<td>' + fmtBytes(t.bytes_sent) + '</td>' +
          '<td class="mono" style="font-size:11px;color:var(--dim)">' + (t.proxy_account ? t.proxy_account.slice(-8) : '—') + '</td></tr>';
      }).join('');
      el.innerHTML =
        '<div class="table-wrap"><table>' +
        '<thead><tr><th>Date</th><th>Domain</th><th>Received</th><th>Sent</th><th>Proxy</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
        '<div style="color:var(--dim);font-size:12px;margin-top:8px">' + data.total + ' total entries</div>';
    }).catch(function(e) { el.innerHTML = '<div style="color:var(--red)">Error: ' + e + '</div>'; });
  };

  window.loadTopDomains = function() {
    var el = document.getElementById('domains-container');
    var proxy = document.getElementById('t-proxy').value.trim();
    var params = proxy ? '?proxy=' + proxy : '';
    fetch('/api/traffic/top-domains' + params).then(function(r) { return r.json(); }).then(function(data) {
      if (!data.length) { el.innerHTML = '<div class="empty">No domain data.</div>'; return; }
      var max = data[0].bytes || 1;
      var rows = data.slice(0, 10).map(function(d, i) {
        var pct = Math.round((d.bytes / max) * 100);
        return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">' +
          '<span style="color:var(--dim);font-size:12px;width:20px">' + (i + 1) + '</span>' +
          '<span style="flex:1;font-size:13px">' + d.domain + '</span>' +
          '<div style="width:120px;background:var(--surface2);border-radius:4px;height:6px">' +
          '<div style="width:' + pct + '%;background:var(--accent);height:6px;border-radius:4px"></div></div>' +
          '<span style="color:var(--accent);font-size:12px;width:70px;text-align:right">' + fmtBytes(d.bytes) + '</span>' +
          '</div>';
      }).join('');
      el.innerHTML = '<div style="border:1px solid var(--border);border-radius:var(--radius);padding:0 16px">' + rows + '</div>';
    }).catch(function() { el.innerHTML = ''; });
  };

  // ── Sessions ─────────────────────────────────────────────────────────────────
  window.loadSessions = function() {
    var el = document.getElementById('sessions-container');
    el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading sessions...</div>';
    fetch('/api/sessions').then(function(r) { return r.json(); }).then(function(data) {
      var list = data.sessions || [];
      if (!list.length) {
        el.innerHTML = '<div class="empty">No sessions saved yet.<br>Create sessions with <code>anyip get</code> or <code>anyip gen</code></div>';
        return;
      }
      var rows = list.map(function(s) {
        var proxyUrl = s.connectionType + '://' + s.username + ':' + s.password + '@' + s.server + ':' + s.port;
        var location = [s.country, s.region, s.city].filter(Boolean).join('/') || '—';
        var mode = s.rotating ? '↻ Rotating' : ('⟳ Sticky' + (s.sessTime ? ' ' + s.sessTime + 'min' : ''));
        return '<tr>' +
          '<td class="mono" style="color:var(--yellow)">' + s.name + '</td>' +
          '<td>' + (s.networkType || '—') + '</td>' +
          '<td>' + location + '</td>' +
          '<td style="color:var(--dim)">' + mode + '</td>' +
          '<td class="mono">' + (s.lastIp || '—') + '</td>' +
          '<td><div class="actions"><button class="btn btn-sm" onclick="copyText(\\'' + proxyUrl + '\\')">Copy URL</button></div></td>' +
          '</tr>';
      }).join('');
      el.innerHTML =
        '<div class="table-wrap"><table>' +
        '<thead><tr><th>Name</th><th>Type</th><th>Location</th><th>Mode</th><th>Last IP</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
        '<div style="color:var(--dim);font-size:12px;margin-top:8px;padding:0 4px">' + list.length + ' session(s) — created via CLI</div>';
    }).catch(function(e) {
      el.innerHTML = '<div class="empty" style="color:var(--red)">Error loading sessions: ' + e + '</div>';
    });
  };

  // ── AI Generator ─────────────────────────────────────────────────────────────
  window.setExample = function(text) {
    document.getElementById('usecase-input').value = text;
  };

  var currentPlan = null;

  window.generatePlan = function() {
    var input = document.getElementById('usecase-input').value.trim();
    if (!input) { toast('Please describe your use case', 'error'); return; }
    var btn = document.getElementById('gen-btn');
    btn.disabled = true;
    btn.textContent = 'Analyzing...';
    document.getElementById('plan-container').innerHTML =
      '<div class="loading" style="margin-top:24px"><div class="spinner"></div>Claude is analyzing your use case...</div>';
    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: input })
    }).then(function(r) { return r.json(); }).then(function(plan) {
      currentPlan = plan;
      renderPlan(plan);
    }).catch(function(e) {
      document.getElementById('plan-container').innerHTML = '<div style="color:var(--red);margin-top:16px">Error: ' + e + '</div>';
    }).finally(function() {
      btn.disabled = false;
      btn.textContent = 'Generate Plan with AI';
    });
  };

  function renderPlan(plan) {
    var cards = (plan.proxy_plan || []).map(function(item) {
      var meta = [];
      if (item.type) meta.push('<span>&#128246; ' + item.type + '</span>');
      if (item.country) meta.push('<span>&#127760; ' + item.country + (item.region ? ' / ' + item.region : '') + '</span>');
      if (item.rotating) meta.push('<span>&#8635; Rotating</span>');
      else if (item.session_prefix) meta.push('<span>&#128274; Sticky — prefix: <code>' + item.session_prefix + '</code></span>');
      if (item.sess_time) meta.push('<span>&#128337; ' + item.sess_time + ' min session</span>');
      return '<div class="plan-card">' +
        '<div class="plan-card-title">' + item.description + '</div>' +
        '<div class="plan-card-meta">' + meta.join('') + '</div>' +
        '<div style="display:flex;align-items:baseline;gap:8px;margin-top:10px">' +
        '<span style="font-size:22px;font-weight:700;color:var(--accent)">' + item.count + '</span>' +
        '<span style="color:var(--dim);font-size:12px">proxies &nbsp;·&nbsp; ' + fmtBytes(item.quota_bytes) + ' each</span>' +
        '</div>' +
        (item.notes ? '<div class="plan-note">' + item.notes + '</div>' : '') +
        '</div>';
    }).join('');

    document.getElementById('plan-container').innerHTML =
      '<div class="plan-analysis"><strong style="color:var(--accent)">Analysis &mdash;</strong> ' + (plan.analysis || '') + '</div>' +
      '<div class="plan-grid">' + cards + '</div>' +
      '<div class="plan-actions">' +
      '<button class="btn btn-primary" style="font-size:14px;padding:8px 20px" onclick="executePlan()">&#10003; Create All ' + plan.total_proxies + ' Proxies</button>' +
      '<span class="plan-summary">~' + plan.estimated_total_quota_gb + ' GB total quota</span>' +
      '</div>' +
      '<div style="margin-top:12px;color:var(--dim);font-size:13px;line-height:1.6"><strong>Rotation strategy:</strong> ' + (plan.rotation_strategy || '') + '</div>';
  }

  window.executePlan = function() {
    if (!currentPlan) return;
    var btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Creating proxies...';
    fetch('/api/generate/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: currentPlan.proxy_plan })
    }).then(function(r) { return r.json(); }).then(function(result) {
      var created = result.created || [];
      toast('Created ' + created.length + ' proxies!', 'ok');
      renderProxyList(created, currentPlan);
      loadProxies();
    }).catch(function(e) {
      toast('Error: ' + e, 'error');
      btn.disabled = false;
      btn.textContent = 'Retry';
    });
  };

  function renderProxyList(proxies, plan) {
    var lines = [];
    lines.push('# anyIP Proxy List');
    lines.push('# Generated: ' + new Date().toISOString().slice(0,10));
    lines.push('# Total: ' + proxies.length + ' proxies');
    lines.push('#');
    proxies.forEach(function(p, i) {
      if (p.username && p.plain_password) {
        lines.push('http://' + p.username + ':' + p.plain_password + '@gate.anyip.io:8080');
      } else {
        lines.push('# ' + (p.username || p.id) + ' (password not returned — check dashboard)');
      }
    });
    var text = lines.join('\\n');
    var container = document.getElementById('plan-container');
    container.innerHTML += '<div style="margin-top:24px">' +
      '<div class="result-header">' +
      '<div style="font-weight:600;font-size:15px">Proxy Credentials</div>' +
      '<button class="btn btn-sm" onclick="copyText(document.getElementById(\\'cred-box\\').textContent)">Copy All</button>' +
      '</div>' +
      '<pre id="cred-box" class="result-list">' + lines.map(function(l) {
        if (l.startsWith('#')) return '<span class="result-comment">' + l + '</span>';
        return '<span class="result-url">' + l + '</span>';
      }).join('\\n') + '</pre>' +
      '<div style="color:var(--dim);font-size:12px;margin-top:8px">Tip: If password is missing, the proxy was created — check the Proxies tab for full details.</div>' +
      '</div>';
  }

  // ── Clipboard ───────────────────────────────────────────────────────────────
  window.copyText = function(text) {
    navigator.clipboard.writeText(text).then(function() {
      toast('Copied!', 'ok');
    }).catch(function() { toast('Copy failed', 'error'); });
  };

  // ── Init ────────────────────────────────────────────────────────────────────
  loadAccount();
  loadProxies();
})();
</script>
</body>
</html>`;
}
