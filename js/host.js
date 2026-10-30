// Host desk (host.html). Sign in, manage teams, award challenges.
import { getStore, standings, esc, fmt, sgn, ago, repoLabel } from "./store.js";
import { CHALLENGES, BY_ID, CATEGORIES, TEAM_COLORS } from "./challenges.js";
import { HUNT_TITLE } from "./config.js";

const app = document.getElementById("app");
let store = null;
let user = null;
let state = { finished: false, teams: [], awards: [] };
let online = true;
let save = { state: "saved" };
let mode = "demo";
let shellReady = false;
let toastTimer = null;

const ui = {
  teamId: sessionStorage.getItem("hunt-team") || null,
  cat: "all", q: "", cid: null, qty: 1, override: "", note: "",
  newColor: TEAM_COLORS[0], confirmReset: false, busy: false,
};

const $ = (id) => document.getElementById(id);
const team = (id) => state.teams.find((t) => t.id === id) || null;

/* ---------- Sign-in ---------- */
function renderSignIn(err = "") {
  shellReady = false;
  app.innerHTML = `<div class="wrap"><header class="top"><div class="brand"><h1>${esc(HUNT_TITLE)}</h1><span>Host desk</span></div></header>
  <form class="signin card" id="signin">
    <h3>Host sign in</h3>
    ${mode === "github" ? `
    <p class="rules" style="margin:0">Paste a GitHub fine-grained token with <b>Contents: Read and write</b> on <b>${esc(repoLabel)}</b> only.
      It is saved in this browser and sent only to GitHub.
      <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create a token</a></p>
    <input class="field" id="tok" type="password" placeholder="github_pat_…" autocomplete="off" required>` : `
    <input class="field" id="email" type="email" placeholder="Email" autocomplete="username" required>
    <input class="field" id="pw" type="password" placeholder="Password" autocomplete="current-password" required>`}
    <p class="err" id="err">${esc(err)}</p>
    <button class="btn" type="submit">Sign in</button>
    <a class="rules" href="index.html">← Back to the leaderboard</a>
  </form></div>`;
}

/* ---------- Shell ---------- */
function renderShell() {
  shellReady = true;
  app.innerHTML = `<div class="wrap">
  <header class="top"><div class="brand"><h1>${esc(HUNT_TITLE)}</h1><span>Host desk</span></div>
    <span id="status"></span>
    <nav class="tabs"><a href="index.html" target="_blank" rel="noopener">Open board</a></nav>
  </header>
  ${mode === "demo" ? `<div class="banner">Demo mode: changes stay in this browser. Open the board in another tab to watch it update. See README.md to go live.</div>` : ""}
  <div class="host">
    <div class="stack">
      <section class="card"><h3>Award points</h3>
        <div id="pills"></div>
        <div class="chips" id="chips"></div>
        <input class="field" id="q" type="search" placeholder="Search challenges" autocomplete="off">
        <div class="clist" id="clist" style="margin-top:10px"></div>
        <div id="awardbar"></div>
      </section>
      <section class="card"><h3>Recent awards</h3><div id="log"></div></section>
    </div>
    <div class="stack">
      <section class="card"><h3>Teams</h3>
        <div id="teams"></div>
        <form id="addteam" style="margin-top:14px">
          <input class="field" id="newteam" placeholder="New team name" maxlength="40" autocomplete="off">
          <div class="swatches" id="swatches"></div>
          <button class="btn" type="submit">Add team</button>
        </form>
      </section>
      <section class="card"><h3>Hunt</h3><div id="huntctl"></div></section>
      <div class="who-bar">Signed in as ${esc(user.email)}${mode !== "demo" ? ` · <button class="btn ghost sm" data-act="signout">Sign out</button>` : ""}</div>
    </div>
  </div></div>`;
  updateAll();
}

/* ---------- Regions ---------- */
function updateStatus() {
  if (!shellReady) return;
  const live = `<span class="status${state.finished ? " final" : online ? "" : " off"}"><i></i>${state.finished ? "Final" : online ? "Live" : "Offline"}</span>`;
  if (mode !== "github") { setRegion("status", live); return; }
  const n = save.count || 0, ch = `${n} change${n === 1 ? "" : "s"}`;
  const msg =
    save.state === "saving" ? `<span class="saving">Committing ${ch}…</span>`
    : save.state === "pending" ? `<span class="saving">${ch} waiting</span> <button class="btn sm" data-act="publish">Publish now</button>`
    : save.state === "error" ? `<span class="saving" style="color:var(--bad)">Not saved: ${esc(save.message)}</span> <button class="btn sm" data-act="publish">Retry</button>`
    : save.at ? `<span class="saving">Saved · board shows it in about a minute</span>` : `<span class="saving">All saved</span>`;
  setRegion("status", `<span class="row2">${live}${msg}</span>`);
}

function setRegion(id, html, guardInputs = false) {
  const el = $(id);
  if (!el) return;
  if (guardInputs && el.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
  el.innerHTML = html;
}

function updateAll() {
  if (!shellReady) return;
  if (ui.teamId && !team(ui.teamId)) ui.teamId = null;
  if (!ui.teamId && state.teams.length) ui.teamId = state.teams[0].id;

  updateStatus();

  setRegion("pills", state.teams.length
    ? `<div class="pills" role="group" aria-label="Team">` + state.teams.map((t) =>
        `<button class="pill" data-act="team" data-id="${t.id}" aria-pressed="${t.id === ui.teamId}" style="--team:${esc(t.color)}"><i></i>${esc(t.name)}</button>`).join("") + `</div>`
    : `<div class="empty" style="padding:16px">Add a team first (Teams panel).</div>`);

  setRegion("chips", CATEGORIES.map(([k, l]) =>
    `<button class="chip" data-act="cat" data-id="${k}" aria-pressed="${ui.cat === k}">${l}</button>`).join(""));

  updatePicker();
  updateLog();
  updateTeams();
  setRegion("swatches", TEAM_COLORS.map((c) =>
    `<button type="button" class="sw" data-act="color" data-id="${c}" aria-pressed="${ui.newColor === c}" style="--team:${c}" aria-label="Team color ${c}"></button>`).join(""));
  setRegion("huntctl", `<div class="row2">${state.finished
      ? `<button class="btn" data-act="reopen">Reopen hunt</button>`
      : `<button class="btn" data-act="finish">End hunt &amp; crown winner</button>`}
      <button class="btn ghost" data-act="askreset">Reset everything</button></div>
    ${ui.confirmReset ? `<div class="confirm">This deletes every team and award.
      <div class="row2" style="margin-top:8px"><button class="btn danger sm" data-act="reset">Yes, reset</button>
      <button class="btn ghost sm" data-act="cancelreset">Cancel</button></div></div>` : ""}`);
}

function doneMap() {
  const m = {};
  state.awards.forEach((a) => { if (a.teamId === ui.teamId && a.cid) m[a.cid] = (m[a.cid] || 0) + 1; });
  return m;
}

function updatePicker() {
  const q = ui.q.trim().toLowerCase();
  const list = CHALLENGES.filter((c) => (ui.cat === "all" || c.cat === ui.cat) && (!q || c.name.toLowerCase().includes(q)));
  const dm = doneMap();
  setRegion("clist", list.length ? list.map((c) =>
    `<button class="citem" data-act="pick" data-id="${c.id}" aria-pressed="${ui.cid === c.id}">
      <span class="n">${esc(c.name)}${dm[c.id] ? `<span class="done">✓ ${dm[c.id] > 1 ? dm[c.id] + "×" : "done"}</span>` : ""}${c.unit ? `<span class="u">${fmt(c.pts)} per ${c.unit}</span>` : ""}</span>
      <span class="v${c.pts < 0 ? " neg" : ""}">${sgn(c.pts)}</span></button>`).join("")
    : `<div class="empty" style="border:0">No challenge matches “${esc(ui.q)}”.</div>`);
  updateAwardBar();
}

function awardPts() {
  const c = BY_ID[ui.cid];
  if (!c) return 0;
  if (ui.override !== "" && ui.override !== "-" && !isNaN(Number(ui.override))) return Math.round(Number(ui.override));
  return c.pts * ui.qty;
}

function updateAwardBar() {
  const c = BY_ID[ui.cid], t = team(ui.teamId);
  if (!c) { setRegion("awardbar", `<div class="award"><div class="sel"><em>Pick a challenge above to award it.</em></div></div>`); return; }
  setRegion("awardbar", `<div class="award">
    <div class="sel">${esc(c.name)} <em>→ ${esc(t ? t.name : "no team selected")}</em></div>
    <div class="lab">${c.unit ? esc(c.unit) + "s" : "Times"}<div class="step">
      <button type="button" data-act="dec" aria-label="Fewer">−</button><output id="qty">${ui.qty}</output>
      <button type="button" data-act="inc" aria-label="More">+</button></div></div>
    <label class="lab" for="ovr">Custom points<input class="field" id="ovr" inputmode="numeric" placeholder="${c.pts * ui.qty}" value="${esc(ui.override)}"></label>
    <label class="lab note" for="note">Note<input class="field" id="note" placeholder="optional" maxlength="60" value="${esc(ui.note)}"></label>
    <button class="btn" id="awardbtn" data-act="award" ${!t || ui.busy ? "disabled" : ""}>Award ${sgn(awardPts())}</button></div>`);
}

function updateLog() {
  const byId = Object.fromEntries(state.teams.map((t) => [t.id, t]));
  const rows = state.awards.filter((a) => byId[a.teamId]);
  setRegion("log", rows.length ? `<ul class="log">` + rows.map((a) => {
    const t = byId[a.teamId];
    return `<li style="--team:${esc(t.color)}"><span class="dot"></span><div style="min-width:0">${esc(a.label)}<br>
      <small>${esc(t.name)}${a.note ? " · " + esc(a.note) : ""} · <span data-ts="${a.ts}">${ago(a.ts)}</span></small></div>
      <span class="p${a.points < 0 ? " neg" : ""}">${sgn(a.points)}</span>
      <button class="x" data-act="undo" data-id="${a.id}" aria-label="Remove award">×</button></li>`;
  }).join("") + `</ul>` : `<div class="empty" style="padding:16px">Nothing awarded yet.</div>`);
}

function updateTeams() {
  const pts = Object.fromEntries(standings(state).map((x) => [x.t.id, x.pts]));
  setRegion("teams", state.teams.map((t) =>
    `<div class="trow" style="--team:${esc(t.color)}"><i></i>
      <input class="field" data-act="rename" data-id="${t.id}" id="tn-${t.id}" value="${esc(t.name)}" aria-label="Team name">
      <span class="pp">${fmt(pts[t.id] || 0)}</span>
      <button class="x" data-act="deltm" data-id="${t.id}" aria-label="Delete ${esc(t.name)}">×</button></div>`).join(""), true);
}

/* ---------- Actions ---------- */
function toast(msg) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3000);
}

async function run(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (e) {
    const denied = e && /permission/i.test(e.code || e.message || "");
    toast(denied ? "This account isn’t allowed to edit. Check the host UID in the database rules." : "Couldn’t save: " + (e.message || e));
  }
}

function nextFreeColor() {
  const used = state.teams.map((t) => t.color);
  return TEAM_COLORS.find((c) => !used.includes(c)) || TEAM_COLORS[state.teams.length % TEAM_COLORS.length];
}

document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-act]");
  if (!b || !store) return;
  const { act, id } = b.dataset;
  switch (act) {
    case "team": ui.teamId = id; sessionStorage.setItem("hunt-team", id); updateAll(); break;
    case "cat": ui.cat = id; updateAll(); break;
    case "pick": if (ui.cid !== id) { ui.qty = 1; ui.override = ""; } ui.cid = id; updatePicker(); break;
    case "inc": ui.qty = Math.min(99, ui.qty + 1); updateAwardBar(); break;
    case "dec": ui.qty = Math.max(1, ui.qty - 1); updateAwardBar(); break;
    case "color": ui.newColor = id; updateAll(); break;
    case "award": {
      const c = BY_ID[ui.cid], t = team(ui.teamId);
      if (!c || !t || ui.busy) return;
      const points = awardPts();
      const award = {
        teamId: t.id, cid: c.id, points, qty: ui.qty, ts: Date.now(),
        label: c.name + (ui.qty > 1 ? " ×" + ui.qty : ""), note: ui.note.trim(),
      };
      ui.busy = true; updateAwardBar();
      run(() => store.addAward(award), `${sgn(points)} to ${t.name}`).finally(() => {
        ui.busy = false; ui.cid = null; ui.qty = 1; ui.override = ""; ui.note = ""; updatePicker();
      });
      break;
    }
    case "undo": run(() => store.removeAward(id), "Award removed"); break;
    case "deltm": {
      const t = team(id);
      const awardIds = state.awards.filter((a) => a.teamId === id).map((a) => a.id);
      run(() => store.deleteTeam(id, awardIds), `${t ? t.name : "Team"} deleted`);
      break;
    }
    case "finish": run(() => store.setFinished(true), "Hunt ended. Winner crowned."); break;
    case "reopen": run(() => store.setFinished(false), "Hunt reopened"); break;
    case "askreset": ui.confirmReset = true; updateAll(); break;
    case "cancelreset": ui.confirmReset = false; updateAll(); break;
    case "reset": ui.confirmReset = false; run(() => store.reset(), "Everything reset"); break;
    case "signout": store.signOut(); break;
    case "publish": store.publishNow && store.publishNow(); break;
  }
});

document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.id === "q") { ui.q = el.value; updatePicker(); }
  else if (el.id === "ovr") {
    ui.override = el.value.replace(/[^0-9-]/g, "");
    const btn = $("awardbtn"); if (btn) btn.textContent = "Award " + sgn(awardPts());
  } else if (el.id === "note") ui.note = el.value;
});

document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.dataset.act !== "rename") return;
  const t = team(el.dataset.id), name = el.value.trim();
  if (!t) return;
  if (!name || name === t.name) { el.value = t.name; return; }
  run(() => store.renameTeam(t.id, name), "Renamed to " + name);
});

document.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (ev.target.id === "signin") {
    const err = $("err"); err.textContent = "";
    try {
      if (mode === "github") await store.signIn($("tok").value);
      else await store.signIn($("email").value.trim(), $("pw").value);
    } catch (e) {
      err.textContent = mode === "github" ? (e.message || "Sign-in failed.") : "Sign-in failed. Check the email and password.";
    }
  } else if (ev.target.id === "addteam") {
    const input = $("newteam"), name = input.value.trim();
    if (!name) return;
    const color = ui.newColor;
    input.value = "";
    try {
      const key = await store.addTeam({ name, color });
      ui.teamId = key; sessionStorage.setItem("hunt-team", key);
      ui.newColor = nextFreeColor(); updateAll(); toast(name + " added");
    } catch (e) { input.value = name; run(() => Promise.reject(e)); }
  }
});

setInterval(() => {
  document.querySelectorAll("[data-ts]").forEach((n) => (n.textContent = ago(Number(n.dataset.ts))));
}, 30000);

/* ---------- Boot ---------- */
getStore({ host: true }).then((s) => {
  store = s;
  mode = s.mode;
  if (s.onSaveStatus) s.onSaveStatus((st) => { save = st; updateStatus(); });
  store.onConnection((c) => { online = c; updateAll(); });
  store.subscribe((data) => {
    state = data;
    if (!ui.newColor || state.teams.some((t) => t.color === ui.newColor)) ui.newColor = nextFreeColor();
    updateAll();
  }, () => {});
  store.onAuth((u) => {
    user = u;
    if (u) renderShell(); else renderSignIn();
  });
}).catch((e) => {
  app.innerHTML = `<div class="wrap"><div class="banner">Couldn’t load: ${esc(e.message || e)}</div></div>`;
});
