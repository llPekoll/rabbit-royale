/**
 * The back office page, as a string: rr-admin is ONE compiled binary
 * (Dockerfile.admin), so the page travels inside the code rather than beside it.
 *
 * String.raw so the page's own backslashes survive. The page therefore never
 * uses a backtick nor a dollar-brace — they would end or open this literal.
 *
 * In English: it is read by the growth side as much as by us.
 */
export const ADMIN_PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Rabbit Royale Back Office</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
:root {
  --bg: #f6f3ee; --panel: #ffffff; --ink: #1f1a17; --dim: #6f655d; --line: #e6dfd5;
  --accent: #b5532c; --good: #2f7d4f; --bad: #b3261e;
  --c1: #b5532c; --c2: #3b6ea8; --c3: #7a5aa6; --c4: #2f7d4f; --c5: #c9962b;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #15120f; --panel: #1f1b17; --ink: #f1ebe3; --dim: #a59a8f; --line: #332c25;
    --accent: #e07a4b; --good: #5cb27e; --bad: #ef6b60;
    --c1: #e07a4b; --c2: #6f9fd8; --c3: #a98bd6; --c4: #5cb27e; --c5: #e2b453;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 2; }
h1 { font-size: 17px; margin: 0; letter-spacing: .2px; }
h1 small { color: var(--dim); font-weight: 400; margin-left: 6px; }
h2 { font-size: 15px; margin: 0 0 10px; }
main { max-width: 1240px; margin: 0 auto; padding: 16px; display: grid; gap: 16px; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg button { border: 0; background: transparent; color: var(--ink); padding: 6px 10px; cursor: pointer; font: inherit; }
.seg button.on { background: var(--accent); color: #fff; }
label.reg { display: inline-flex; gap: 4px; align-items: center; padding: 4px 8px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
label.reg .st { font-size: 11px; color: var(--dim); }
label.reg.err .st { color: var(--bad); }
button.act { border: 1px solid var(--line); background: var(--panel); color: var(--ink); padding: 6px 10px; border-radius: 8px; cursor: pointer; font: inherit; }
button.act:hover { border-color: var(--accent); }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px; min-width: 0; }
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.kpi { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
.kpi .v { font-size: 22px; font-weight: 650; font-variant-numeric: tabular-nums; }
.kpi .k { color: var(--dim); font-size: 12px; }
.kpi .s { color: var(--dim); font-size: 11px; margin-top: 2px; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 16px; }
.chart { position: relative; height: 260px; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: 5px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
th { color: var(--dim); font-weight: 500; font-size: 12px; }
.scroll { overflow-x: auto; max-height: 460px; overflow-y: auto; }
.funnel-row { display: grid; grid-template-columns: minmax(150px, 220px) 1fr 70px 70px; gap: 8px; align-items: center; padding: 4px 0; }
.bar { height: 18px; background: var(--line); border-radius: 4px; overflow: hidden; }
.bar > div { height: 100%; background: var(--accent); }
.funnel-row .n, .funnel-row .p { text-align: right; font-variant-numeric: tabular-nums; }
.funnel-row .p { color: var(--dim); font-size: 12px; }
.note { color: var(--dim); font-size: 12px; }
.defs dt { font-weight: 600; margin-top: 8px; }
.defs dd { margin: 2px 0 0; color: var(--dim); }
#login { max-width: 360px; margin: 12vh auto; padding: 24px; text-align: center; }
#login input { font: 600 28px/1 ui-monospace, monospace; letter-spacing: 8px; text-align: center; width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--ink); margin: 12px 0; }
#login .err, #setup .err { color: var(--bad); min-height: 20px; }
#login input.email, .field { font: inherit; width: 100%; padding: 9px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--ink); }
#login input.email { letter-spacing: 0; text-align: left; font-weight: 400; font-size: 15px; margin: 12px 0 0; }
#setup { max-width: 420px; margin: 8vh auto; padding: 24px; text-align: center; }
#setup input.code { font: 600 28px/1 ui-monospace, monospace; letter-spacing: 8px; text-align: center; width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--ink); margin: 12px 0; }
#qr { display: inline-block; padding: 10px; background: #fff; border-radius: 8px; margin: 8px 0; }
#qr img, #qr canvas { display: block; }
.mono { font-family: ui-monospace, monospace; word-break: break-all; }
.who { color: var(--dim); font-size: 12px; }
.team-add { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.team-add .field { flex: 1 1 220px; width: auto; }
.team-add select.field { flex: 0 0 auto; }
.linkbox { margin-top: 12px; padding: 12px; border: 1px dashed var(--accent); border-radius: 10px; }
.linkbox .field { margin: 6px 0; }
td .act { padding: 3px 8px; font-size: 12px; }
#team-table th, #team-table td { text-align: left; }
#team-table td:last-child { text-align: right; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; border: 1px solid var(--line); }
.pill.ok { color: var(--good); border-color: var(--good); }
.pill.wait { color: var(--dim); }
.hidden { display: none !important; }
@media (max-width: 640px) {
  header { position: static; }
  .funnel-row { grid-template-columns: 1fr 60px; }
  .funnel-row .bar, .funnel-row .p { display: none; }
}
</style>
</head>
<body>
<section id="login" class="panel hidden">
  <h1>Rabbit Royale Back Office</h1>
  <p class="note">Your email, then the 6-digit code from your authenticator app.</p>
  <form id="login-form">
    <input id="email" class="email" type="email" autocomplete="username" placeholder="you@example.com" required>
    <input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="000000" required>
    <button class="act" type="submit">Sign in</button>
  </form>
  <p class="err" id="login-err"></p>
</section>

<section id="setup" class="panel hidden">
  <h1>Rabbit Royale Back Office</h1>
  <div id="setup-body">
    <p class="note">Access for <b id="setup-email"></b>. Scan this code with an authenticator app (Google Authenticator, 1Password, Authy...).</p>
    <div id="qr"></div>
    <p class="note">On this phone? <a id="setup-uri" href="#">Open it in your authenticator app</a>. Or type this key by hand:</p>
    <p class="mono" id="setup-secret"></p>
    <p class="note">Then enter the 6-digit code it shows. This link works once.</p>
    <form id="setup-form">
      <input id="setup-code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="000000" required>
      <button class="act" type="submit">Confirm and sign in</button>
    </form>
  </div>
  <p class="err" id="setup-err"></p>
</section>

<div id="app" class="hidden">
<header>
  <h1>Rabbit Royale <small>back office</small></h1>
  <div class="controls">
    <div class="seg" id="range">
      <button data-d="7">7d</button><button data-d="30">30d</button><button data-d="90" class="on">90d</button><button data-d="365">365d</button>
    </div>
    <span id="regions" class="controls"></span>
    <button class="act" id="csv-daily">Daily CSV</button>
    <button class="act" id="csv-cohorts">Cohorts CSV</button>
    <button class="act" id="csv-funnel">Funnel CSV</button>
    <span class="who" id="who"></span>
    <button class="act" id="logout">Sign out</button>
  </div>
</header>
<main>
  <div class="note" id="status"></div>
  <div class="kpis" id="kpis"></div>

  <div class="grid2">
    <section class="panel"><h2>Sign-ups per day</h2><div class="chart"><canvas id="ch-signups"></canvas></div></section>
    <section class="panel"><h2>Active players (DAU &middot; WAU &middot; MAU)</h2><div class="chart"><canvas id="ch-active"></canvas></div></section>
    <section class="panel"><h2>Who was active: new &middot; returning &middot; reactivated</h2><div class="chart"><canvas id="ch-mix"></canvas></div></section>
    <section class="panel"><h2>Core actions per day</h2><div class="chart"><canvas id="ch-engage"></canvas></div></section>
    <section class="panel"><h2>Revenue per day (USD, confirmed)</h2><div class="chart"><canvas id="ch-revenue"></canvas></div></section>
    <section class="panel"><h2>Funnel (players who signed up in the range)</h2><div id="funnel"></div>
      <p class="note">Nested: each step counts players who also did every step above. Bar: share of sign-ups. Right: conversion from the step above. Purchases regardless of the path are in the KPIs.</p></section>
  </div>

  <section class="panel"><h2>Cohort retention (by sign-up day)</h2>
    <div class="scroll"><table id="cohorts"></table></div>
    <p class="note">&mdash; = the day has not fully elapsed yet. Totals weight each cohort by its size.</p>
  </section>

  <div class="grid2">
    <section class="panel"><h2>Players by level</h2><div class="scroll"><table id="levels"></table></div></section>
    <section class="panel"><h2>Players per region &amp; push opt-in</h2><div class="scroll"><table id="regionsnap"></table></div></section>
  </div>

  <section class="panel hidden" id="team"><h2>Team</h2>
    <p class="note">People who can open this back office. Viewers see every number and export CSVs; only the owner manages the team. Each person signs in with their email and their own authenticator app.</p>
    <div class="scroll"><table id="team-table"></table></div>
    <form class="team-add" id="team-form">
      <input class="field" id="team-email" type="email" placeholder="name@example.com" required>
      <select class="field" id="team-role"><option value="viewer">Viewer</option></select>
      <button class="act" type="submit">Add</button>
    </form>
    <p class="err" id="team-err" style="color: var(--bad)"></p>
    <div class="linkbox hidden" id="team-link">
      <div>Send this link to <b id="team-link-email"></b>. It works once, for 7 days, and sets up their code. Nobody else sees their key.</div>
      <input class="field mono" id="team-link-url" readonly>
      <button class="act" id="team-link-copy" type="button">Copy link</button>
    </div>
  </section>

  <section class="panel defs"><h2>Definitions and limits</h2>
    <dl>
      <dt>Day</dt><dd>UTC calendar day.</dd>
      <dt>Sign-up</dt><dd>A player row created that day. Guest = no account linked; Account = Google or email; Wallet = Solana wallet linked.</dd>
      <dt>Active</dt><dd>Started at least one island run or one raid that day. There is no login log yet, so opening the app without playing does not count.</dd>
      <dt>DAU / WAU / MAU</dt><dd>Distinct active players that day / in the 7 days / in the 30 days ending that day.</dd>
      <dt>New / returning / reactivated</dt><dd>Among the day's active players: signed up that day / active again within the previous 7 days or signed up in the last 7 days / signed up more than 7 days ago and not active in the previous 7 days.</dd>
      <dt>Activated</dt><dd>Started at least one run (first dig), ever / within 24 h of sign-up.</dd>
      <dt>D1 / D7 / D30</dt><dd>Share of a sign-up day's cohort active on exactly day +1 / +7 / +30 (UTC days). Only cohorts whose day +N is over are counted.</dd>
      <dt>Revenue</dt><dd>Confirmed on-chain payments (USDC, SOL, SKR) at the USD rate quoted at purchase.</dd>
      <dt>Regions</dt><dd>EU, SG and US have separate databases; totals add them. A person playing in two regions counts twice. SG and US started from a copy of EU on 2026-10-02: their accounts created before 2026-10-03 are left out of sign-ups, cohorts and the funnel.</dd>
      <dt>Known gaps</dt><dd>Guests who never finish a run and do not come back within a day are deleted with their runs, so early drop-off is under-counted. No acquisition source, campaign, referral, landing-page visits or install counts are recorded yet. Platform (web vs Android) and country are not in the database yet.</dd>
    </dl>
  </section>
</main>
</div>

<script>
(function () {
  "use strict";
  // One site: the server reads its own region and asks the others, and
  // answers with all of them at once. The list comes back with the numbers.
  var LABELS = { eu: "EU", sg: "SG", us: "US", local: "Local" };
  var REGIONS = [];

  var KEY = "rr-admin-token";
  function store(k, v) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  var token = load(KEY);
  var days = 90;
  var data = {};      // region id -> payload
  var errors = {};    // region id -> message
  var enabled = {};   // region id -> bool
  var charts = {};

  var $ = function (id) { return document.getElementById(id); };
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function fmt(n) { return (n === null || n === undefined || isNaN(n)) ? "\u2014" : Number(n).toLocaleString("en-US"); }
  function pct(a, b) { return b > 0 ? (100 * a / b) : null; }
  function fmtPct(v) { return v === null ? "\u2014" : v.toFixed(1) + "%"; }
  function usd(n) { return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var EMAIL_KEY = "rr-admin-email";
  function remember(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function recall(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  var me = null;      // { email, role }

  function showLogin(msg) {
    $("app").classList.add("hidden");
    $("setup").classList.add("hidden");
    $("login").classList.remove("hidden");
    $("login-err").textContent = msg || "";
    $("code").value = "";
    if (!$("email").value) $("email").value = recall(EMAIL_KEY);
    ($("email").value ? $("code") : $("email")).focus();
  }

  function post(path, payload) {
    var h = { "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    return fetch(path, { method: "POST", headers: h, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); });
  }

  function signedIn(j) {
    token = j.token; store(KEY, token);
    me = { email: j.email, role: j.role };
    remember(EMAIL_KEY, j.email);
    start();
  }

  $("login-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    $("login-err").textContent = "";
    token = null;
    post("/api/login", { email: $("email").value, code: $("code").value })
      .then(function (res) {
        if (!res.ok) { showLogin(res.status === 429 ? "Too many tries. Wait a few minutes." : "Wrong email or code."); return; }
        signedIn(res.j);
      })
      .catch(function () { showLogin("Server unreachable."); });
  });

  $("logout").addEventListener("click", function () { token = null; me = null; store(KEY, null); showLogin(""); });

  // -- Setup link (#setup=...): a new member scans their key, once ----------
  var setupToken = null;
  function showSetup(t) {
    setupToken = t;
    $("login").classList.add("hidden");
    $("app").classList.add("hidden");
    $("setup").classList.remove("hidden");
    $("setup-body").classList.add("hidden");
    post("/api/setup", { token: t }).then(function (res) {
      if (!res.ok) { $("setup-err").textContent = res.status === 429 ? "Too many tries. Wait a few minutes." : "This link has expired or was already used. Ask for a new one."; return; }
      $("setup-email").textContent = res.j.email;
      $("setup-secret").textContent = res.j.secret.replace(/(.{4})/g, "$1 ").trim();
      $("setup-uri").href = res.j.uri;
      $("qr").innerHTML = "";
      if (window.QRCode) new QRCode($("qr"), { text: res.j.uri, width: 184, height: 184 });
      else $("qr").classList.add("hidden");
      $("setup-body").classList.remove("hidden");
      $("setup-code").focus();
    }).catch(function () { $("setup-err").textContent = "Server unreachable."; });
  }
  $("setup-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    $("setup-err").textContent = "";
    post("/api/setup/confirm", { token: setupToken, code: $("setup-code").value }).then(function (res) {
      if (!res.ok) { $("setup-err").textContent = res.status === 429 ? "Too many tries. Wait a few minutes." : "Wrong code. Wait for the next one and try again."; $("setup-code").value = ""; return; }
      history.replaceState(null, "", location.pathname);
      signedIn(res.j);
    }).catch(function () { $("setup-err").textContent = "Server unreachable."; });
  });

  // -- Team (owner) ----------------------------------------------------------
  function day(s) { return s ? String(s).slice(0, 10) : "\u2014"; }
  function loadTeam() {
    fetch("/api/team", { headers: { Authorization: "Bearer " + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        var rows = '<thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Added</th><th>Last sign-in</th><th></th></tr></thead><tbody>' +
          '<tr><td>' + esc(me.email) + '</td><td>Owner</td><td><span class="pill ok">active</span></td><td>\u2014</td><td>\u2014</td><td></td></tr>';
        j.members.forEach(function (m) {
          var st = m.active ? '<span class="pill ok">active</span>' : '<span class="pill wait">link sent, until ' + esc(day(m.setup_expires)) + '</span>';
          rows += '<tr><td>' + esc(m.email) + '</td><td>' + esc(m.role.charAt(0).toUpperCase() + m.role.slice(1)) + '</td><td>' + st + '</td><td>' + esc(day(m.added_at)) +
            '</td><td>' + esc(day(m.last_login_at)) + '</td><td><button class="act" data-reset="' + esc(m.email) + '">New link</button> <button class="act" data-remove="' + esc(m.email) + '">Remove</button></td></tr>';
        });
        $("team-table").innerHTML = rows + "</tbody>";
        Array.prototype.forEach.call(document.querySelectorAll("[data-reset]"), function (b) {
          b.addEventListener("click", function () {
            var e = b.getAttribute("data-reset");
            if (!confirm("Make a new setup link for " + e + "? Their current code stops working until they use it.")) return;
            teamCall("/api/team/reset", { email: e }, e);
          });
        });
        Array.prototype.forEach.call(document.querySelectorAll("[data-remove]"), function (b) {
          b.addEventListener("click", function () {
            var e = b.getAttribute("data-remove");
            if (!confirm("Remove " + e + "? They lose access at once.")) return;
            teamCall("/api/team/remove", { email: e }, null);
          });
        });
      });
  }
  var TEAM_ERR = { bad_email: "That email does not look right.", exists: "Already in the team. Use New link to send them a new one.", owner: "That is you.", forbidden: "Only the owner manages the team." };
  function teamCall(path, payload, linkFor) {
    $("team-err").textContent = "";
    $("team-link").classList.add("hidden");
    post(path, payload).then(function (res) {
      if (!res.ok) { $("team-err").textContent = TEAM_ERR[res.j.error] || ("Error " + res.status); return; }
      if (linkFor && res.j.token) {
        $("team-link-email").textContent = linkFor;
        $("team-link-url").value = location.origin + "/#setup=" + res.j.token;
        $("team-link").classList.remove("hidden");
      }
      loadTeam();
    }).catch(function () { $("team-err").textContent = "Server unreachable."; });
  }
  $("team-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var e = $("team-email").value.trim().toLowerCase();
    teamCall("/api/team", { email: e, role: $("team-role").value }, e);
    $("team-email").value = "";
  });
  $("team-link-copy").addEventListener("click", function () {
    var i = $("team-link-url");
    i.select();
    try { navigator.clipboard.writeText(i.value); } catch (e) { document.execCommand("copy"); }
    $("team-link-copy").textContent = "Copied";
    setTimeout(function () { $("team-link-copy").textContent = "Copy link"; }, 1500);
  });

  Array.prototype.forEach.call(document.querySelectorAll("#range button"), function (b) {
    b.addEventListener("click", function () {
      days = Number(b.getAttribute("data-d"));
      Array.prototype.forEach.call(document.querySelectorAll("#range button"), function (x) { x.classList.toggle("on", x === b); });
      fetchAll();
    });
  });

  function start() {
    $("login").classList.add("hidden");
    $("setup").classList.add("hidden");
    $("app").classList.remove("hidden");
    renderRegionToggles();
    fetchAll();
    var ready = me ? Promise.resolve(me) : fetch("/api/me", { headers: { Authorization: "Bearer " + token } })
      .then(function (r) { return r.ok ? r.json() : null; });
    ready.then(function (m) {
      if (!m) return;
      me = m;
      $("who").textContent = m.email + " \u00B7 " + m.role;
      $("team").classList.toggle("hidden", m.role !== "owner");
      if (m.role === "owner") loadTeam();
    });
  }

  function renderRegionToggles() {
    var box = $("regions");
    box.innerHTML = "";
    REGIONS.forEach(function (r) {
      var l = document.createElement("label");
      l.className = "reg" + (errors[r.id] ? " err" : "");
      var st = errors[r.id] ? errors[r.id] : (data[r.id] ? "ok" : "\u2026");
      l.innerHTML = '<input type="checkbox"' + (enabled[r.id] ? " checked" : "") + '> ' + esc(r.label) + ' <span class="st">' + esc(st) + "</span>";
      l.querySelector("input").addEventListener("change", function (ev) { enabled[r.id] = ev.target.checked; render(); });
      box.appendChild(l);
    });
  }

  function fetchAll() {
    $("status").textContent = "Loading\u2026";
    data = {}; errors = {};
    renderRegionToggles();
    fetch("/api/metrics?days=" + days, { headers: { Authorization: "Bearer " + token } })
      .then(function (res) {
        if (res.status === 401) { token = null; store(KEY, null); showLogin("Session expired."); return; }
        if (!res.ok) { $("status").textContent = "Error " + res.status; return; }
        return res.json().then(function (j) {
          REGIONS = j.regions.map(function (r) {
            if (enabled[r.region] === undefined) enabled[r.region] = true;
            if (r.data) data[r.region] = r.data; else errors[r.region] = r.error || "error";
            return { id: r.region, label: LABELS[r.region] || r.region.toUpperCase() };
          });
          renderRegionToggles();
          render();
        });
      })
      .catch(function () { $("status").textContent = "Server unreachable."; });
  }

  // -- Merging the regions ------------------------------------------------
  function active() { return REGIONS.filter(function (r) { return enabled[r.id] && data[r.id]; }); }

  function dayList() {
    var any = active()[0];
    if (!any) return [];
    var out = [];
    var d = new Date(data[any.id].start + "T00:00:00Z");
    var end = new Date(); end.setUTCHours(0, 0, 0, 0);
    while (d <= end) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); }
    return out;
  }

  function sumSeries(group, fields) {
    var map = {};
    active().forEach(function (r) {
      (data[r.id].daily[group] || []).forEach(function (row) {
        var m = map[row.day] || (map[row.day] = {});
        fields.forEach(function (f) { m[f] = (m[f] || 0) + Number(row[f] || 0); });
      });
    });
    return dayList().map(function (day) {
      var m = map[day] || {};
      var o = { day: day };
      fields.forEach(function (f) { o[f] = m[f] || 0; });
      return o;
    });
  }

  function mergedCohorts() {
    var map = {};
    var F = ["size", "activated", "activated_24h", "d1", "d7", "d30"];
    active().forEach(function (r) {
      data[r.id].cohorts.forEach(function (row) {
        var m = map[row.day] || (map[row.day] = { day: row.day });
        F.forEach(function (f) { m[f] = (m[f] || 0) + Number(row[f] || 0); });
      });
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  var FUNNEL = [
    ["signed_up", "Signed up"],
    ["first_run", "Started a first run"],
    ["run_finished", "Finished a run"],
    ["three_runs", "Played 3+ runs"],
    ["came_back", "Came back another day"],
    ["level_2", "Reached level 2"],
    ["level_3", "Reached level 3 (raids open)"],
    ["first_raid", "Raided someone"],
    ["push_opt_in", "Accepted push notifications"],
    ["paid", "Made a purchase"]
  ];

  function mergedFunnel() {
    var o = {};
    active().forEach(function (r) {
      FUNNEL.forEach(function (f) { o[f[0]] = (o[f[0]] || 0) + Number(data[r.id].funnel[f[0]] || 0); });
    });
    return o;
  }

  function todayStr() { var d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString().slice(0, 10); }
  function plusDays(day, n) { return new Date(new Date(day + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10); }
  function elapsed(day, n) { return plusDays(day, n) < todayStr(); }

  function retention(cohorts, field, n) {
    var a = 0, b = 0;
    cohorts.forEach(function (c) { if (elapsed(c.day, n)) { a += c[field]; b += c.size; } });
    return { v: pct(a, b), base: b };
  }

  // -- Rendering ----------------------------------------------------------
  function render() {
    var regs = active();
    var failed = REGIONS.filter(function (r) { return errors[r.id]; }).map(function (r) { return r.label + ": " + errors[r.id]; });
    var gen = regs.length ? new Date(data[regs[0].id].generatedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "";
    $("status").textContent = regs.length
      ? ("Showing " + regs.map(function (r) { return r.label; }).join(" + ") + " \u00B7 last " + days + " days \u00B7 generated " + gen + (failed.length ? " \u00B7 " + failed.join(", ") : ""))
      : ("No region loaded" + (failed.length ? " \u00B7 " + failed.join(", ") : ""));
    if (!regs.length) return;

    var signups = sumSeries("signups", ["guest", "account", "wallet"]);
    var activeS = sumSeries("active", ["dau", "wau", "mau"]);
    var mix = sumSeries("mix", ["new", "reactivated", "active"]);
    var eng = sumSeries("engagement", ["runs", "runs_done", "runners", "run_ms"]);
    var raids = sumSeries("raids", ["raids", "raids_won", "raiders"]);
    var rev = sumSeries("revenue", ["payments", "payers", "usd"]);
    var carrots = sumSeries("carrotShop", ["carrot_buys"]);
    var cohorts = mergedCohorts();
    var funnel = mergedFunnel();

    var snap = {};
    regs.forEach(function (r) {
      var s = data[r.id].snapshot;
      ["players", "copied", "guests", "accounts", "wallets", "seen_1d", "seen_7d", "seen_30d", "usd_all_time", "payers_all_time"].forEach(function (k) { snap[k] = (snap[k] || 0) + Number(s[k] || 0); });
    });

    var totalSign = signups.reduce(function (a, r) { return a + r.guest + r.account + r.wallet; }, 0);
    var last = activeS[activeS.length - 1] || {};
    var coh = cohorts.reduce(function (a, c) { a.size += c.size; a.act += c.activated; a.a24 += c.activated_24h; return a; }, { size: 0, act: 0, a24: 0 });
    var d1 = retention(cohorts, "d1", 1), d7 = retention(cohorts, "d7", 7), d30 = retention(cohorts, "d30", 30);
    var revenue = rev.reduce(function (a, r) { return a + r.usd; }, 0);
    var payments = rev.reduce(function (a, r) { return a + r.payments; }, 0);

    var K = [
      ["Players", fmt(snap.players), "guest " + fmt(snap.guests) + " \u00B7 account " + fmt(snap.accounts) + " \u00B7 wallet " + fmt(snap.wallets)],
      ["Sign-ups (" + days + "d)", fmt(totalSign), "avg " + (totalSign / days).toFixed(1) + " / day"],
      ["DAU (today)", fmt(last.dau), "UTC day so far"],
      ["WAU", fmt(last.wau), "last 7 days"],
      ["MAU", fmt(last.mau), "last 30 days"],
      ["Activation", fmtPct(pct(coh.act, coh.size)), "24 h: " + fmtPct(pct(coh.a24, coh.size))],
      ["D1 retention", fmtPct(d1.v), "on " + fmt(d1.base) + " sign-ups"],
      ["D7 retention", fmtPct(d7.v), "on " + fmt(d7.base) + " sign-ups"],
      ["D30 retention", fmtPct(d30.v), "on " + fmt(d30.base) + " sign-ups"],
      ["Revenue (" + days + "d)", usd(revenue), fmt(payments) + " payments \u00B7 all time " + usd(snap.usd_all_time)],
      ["Paying players", fmt(snap.payers_all_time), "all time"],
      ["Seen (last_seen)", fmt(snap.seen_1d) + " / " + fmt(snap.seen_7d), "1 d / 7 d, any visit"]
    ];
    $("kpis").innerHTML = K.map(function (k) {
      return '<div class="kpi"><div class="k">' + esc(k[0]) + '</div><div class="v">' + esc(k[1]) + '</div><div class="s">' + esc(k[2]) + "</div></div>";
    }).join("");

    var labels = dayList().map(function (d) { return d.slice(5); });
    chart("ch-signups", "bar", labels, [
      { label: "Guest", data: signups.map(function (r) { return r.guest; }), backgroundColor: css("--c2"), stack: "s" },
      { label: "Account", data: signups.map(function (r) { return r.account; }), backgroundColor: css("--c3"), stack: "s" },
      { label: "Wallet", data: signups.map(function (r) { return r.wallet; }), backgroundColor: css("--c1"), stack: "s" }
    ], true);
    chart("ch-active", "line", labels, [
      { label: "DAU", data: activeS.map(function (r) { return r.dau; }), borderColor: css("--c1"), backgroundColor: css("--c1") },
      { label: "WAU", data: activeS.map(function (r) { return r.wau; }), borderColor: css("--c2"), backgroundColor: css("--c2") },
      { label: "MAU", data: activeS.map(function (r) { return r.mau; }), borderColor: css("--c3"), backgroundColor: css("--c3") }
    ]);
    chart("ch-mix", "bar", labels, [
      { label: "New", data: mix.map(function (r) { return r.new; }), backgroundColor: css("--c4"), stack: "m" },
      { label: "Returning", data: mix.map(function (r) { return Math.max(0, r.active - r.new - r.reactivated); }), backgroundColor: css("--c2"), stack: "m" },
      { label: "Reactivated", data: mix.map(function (r) { return r.reactivated; }), backgroundColor: css("--c5"), stack: "m" }
    ], true);
    chart("ch-engage", "bar", labels, [
      { label: "Runs", data: eng.map(function (r) { return r.runs; }), backgroundColor: css("--c2") },
      { label: "Raids", data: raids.map(function (r) { return r.raids; }), backgroundColor: css("--c1") },
      { label: "Shop buys (carrots)", data: carrots.map(function (r) { return r.carrot_buys; }), backgroundColor: css("--c5") },
      { label: "Avg run (min)", type: "line", yAxisID: "y2", data: eng.map(function (r) { return r.runs_done ? +(r.run_ms / r.runs_done / 60000).toFixed(2) : null; }), borderColor: css("--c3"), backgroundColor: css("--c3") }
    ], false, true);
    chart("ch-revenue", "bar", labels, [
      { label: "USD", data: rev.map(function (r) { return +r.usd.toFixed(2); }), backgroundColor: css("--c4") }
    ]);

    // Funnel
    var top = funnel.signed_up || 0;
    $("funnel").innerHTML = FUNNEL.map(function (f, i) {
      var n = funnel[f[0]] || 0;
      var share = pct(n, top);
      var prev = i ? funnel[FUNNEL[i - 1][0]] || 0 : null;
      var step = i ? pct(n, prev) : null;
      return '<div class="funnel-row"><div>' + (i + 1) + ". " + esc(f[1]) + '</div><div class="bar"><div style="width:' + (share || 0).toFixed(1) + '%"></div></div><div class="n">' + fmt(n) + '</div><div class="p">' + (i ? fmtPct(step) : fmtPct(share)) + "</div></div>";
    }).join("");

    // Cohorts
    var rows = cohorts.slice().reverse();
    var cell = function (c, f, n) {
      if (!elapsed(c.day, n)) return "<td>\u2014</td>";
      var v = pct(c[f], c.size);
      var a = v === null ? 0 : Math.min(1, v / 60);
      return '<td style="background:rgba(181,83,44,' + (a * 0.45).toFixed(3) + ')">' + fmtPct(v) + "</td>";
    };
    $("cohorts").innerHTML = "<thead><tr><th>Sign-up day</th><th>Size</th><th>Activated</th><th>Activated 24 h</th><th>D1</th><th>D7</th><th>D30</th></tr></thead><tbody>" +
      '<tr style="font-weight:600"><td>All</td><td>' + fmt(coh.size) + "</td><td>" + fmtPct(pct(coh.act, coh.size)) + "</td><td>" + fmtPct(pct(coh.a24, coh.size)) + "</td><td>" + fmtPct(d1.v) + "</td><td>" + fmtPct(d7.v) + "</td><td>" + fmtPct(d30.v) + "</td></tr>" +
      rows.map(function (c) {
        return "<tr><td>" + c.day + "</td><td>" + fmt(c.size) + "</td><td>" + fmtPct(pct(c.activated, c.size)) + "</td><td>" + fmtPct(pct(c.activated_24h, c.size)) + "</td>" + cell(c, "d1", 1) + cell(c, "d7", 7) + cell(c, "d30", 30) + "</tr>";
      }).join("") + "</tbody>";

    // Levels
    var lv = {};
    regs.forEach(function (r) { data[r.id].levels.forEach(function (x) { lv[x.level] = (lv[x.level] || 0) + Number(x.players); }); });
    var lvTotal = Object.keys(lv).reduce(function (a, k) { return a + lv[k]; }, 0);
    $("levels").innerHTML = "<thead><tr><th>Level</th><th>Players</th><th>Share</th></tr></thead><tbody>" +
      Object.keys(lv).sort(function (a, b) { return a - b; }).map(function (k) { return "<tr><td>" + k + "</td><td>" + fmt(lv[k]) + "</td><td>" + fmtPct(pct(lv[k], lvTotal)) + "</td></tr>"; }).join("") + "</tbody>";

    // Per region
    $("regionsnap").innerHTML = "<thead><tr><th>Region</th><th>Players</th><th>Copied from EU</th><th>Sign-ups (" + days + "d)</th><th>Seen 7 d</th><th>Push (by platform)</th><th>Revenue all time</th></tr></thead><tbody>" +
      regs.map(function (r) {
        var d = data[r.id], s = d.snapshot;
        var sg = d.daily.signups.reduce(function (a, x) { return a + x.guest + x.account + x.wallet; }, 0);
        var push = d.push.map(function (p) { return esc(p.platform) + " " + fmt(p.players); }).join(" \u00B7 ") || "\u2014";
        return "<tr><td>" + r.label + "</td><td>" + fmt(s.players) + "</td><td>" + fmt(s.copied) + "</td><td>" + fmt(sg) + "</td><td>" + fmt(s.seen_7d) + "</td><td>" + push + "</td><td>" + usd(s.usd_all_time) + "</td></tr>";
      }).join("") + "</tbody>";
  }

  function chart(id, type, labels, datasets, stacked, twoAxes) {
    if (typeof Chart === "undefined") return;
    if (charts[id]) charts[id].destroy();
    var grid = css("--line"), dim = css("--dim");
    var scales = {
      x: { stacked: !!stacked, ticks: { color: dim, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
      y: { stacked: !!stacked, beginAtZero: true, ticks: { color: dim, precision: 0 }, grid: { color: grid } }
    };
    if (twoAxes) scales.y2 = { position: "right", beginAtZero: true, ticks: { color: dim }, grid: { display: false } };
    datasets.forEach(function (d) { d.borderWidth = d.type === "line" || type === "line" ? 2 : 0; d.pointRadius = 0; d.tension = 0.25; });
    charts[id] = new Chart($(id), {
      type: type,
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: dim, boxWidth: 10 } } },
        scales: scales
      }
    });
  }

  // -- CSV ----------------------------------------------------------------
  function csv(name, header, rows) {
    var q = function (v) { v = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var text = [header.join(",")].concat(rows.map(function (r) { return r.map(q).join(","); })).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function byDay(list) { var m = {}; (list || []).forEach(function (r) { m[r.day] = r; }); return m; }

  $("csv-daily").addEventListener("click", function () {
    var H = ["day", "region", "signups_guest", "signups_account", "signups_wallet", "dau", "wau", "mau", "active_new", "active_reactivated", "active_returning", "runs", "runs_finished", "runners", "avg_run_min", "raids", "raids_won", "raiders", "carrot_shop_buys", "payments", "payers", "revenue_usd"];
    var out = [];
    active().forEach(function (r) {
      var d = data[r.id].daily;
      var s = byDay(d.signups), a = byDay(d.active), m = byDay(d.mix), e = byDay(d.engagement), x = byDay(d.raids), v = byDay(d.revenue), c = byDay(d.carrotShop);
      dayList().forEach(function (day) {
        var S = s[day] || {}, A = a[day] || {}, M = m[day] || {}, E = e[day] || {}, X = x[day] || {}, V = v[day] || {}, C = c[day] || {};
        var act = M.active || 0, nw = M.new || 0, re = M.reactivated || 0;
        out.push([day, r.id, S.guest || 0, S.account || 0, S.wallet || 0, A.dau || 0, A.wau || 0, A.mau || 0, nw, re, Math.max(0, act - nw - re),
          E.runs || 0, E.runs_done || 0, E.runners || 0, E.runs_done ? (E.run_ms / E.runs_done / 60000).toFixed(2) : "",
          X.raids || 0, X.raids_won || 0, X.raiders || 0, C.carrot_buys || 0, V.payments || 0, V.payers || 0, V.usd || 0]);
      });
    });
    csv("rabbit-royale-daily-" + days + "d.csv", H, out);
  });

  $("csv-cohorts").addEventListener("click", function () {
    var H = ["signup_day", "region", "size", "activated", "activated_24h", "d1_active", "d7_active", "d30_active", "d1_elapsed", "d7_elapsed", "d30_elapsed"];
    var out = [];
    active().forEach(function (r) {
      data[r.id].cohorts.forEach(function (c) {
        out.push([c.day, r.id, c.size, c.activated, c.activated_24h, c.d1, c.d7, c.d30, elapsed(c.day, 1), elapsed(c.day, 7), elapsed(c.day, 30)]);
      });
    });
    csv("rabbit-royale-cohorts-" + days + "d.csv", H, out);
  });

  $("csv-funnel").addEventListener("click", function () {
    var H = ["step", "stage", "region", "players"];
    var out = [];
    active().forEach(function (r) {
      FUNNEL.forEach(function (f, i) { out.push([i + 1, f[1], r.id, data[r.id].funnel[f[0]] || 0]); });
    });
    csv("rabbit-royale-funnel-" + days + "d.csv", H, out);
  });

  var hash = /^#setup=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (hash) showSetup(hash[1]);
  else if (token) start();
  else showLogin("");
})();
</script>
</body>
</html>
`;
