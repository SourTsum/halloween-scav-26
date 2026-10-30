// Player-facing challenge list (challenges.html). Read-only.
// Static list from challenges.js, plus live fire sales and per-team progress from the store.
import { getStore, esc, fmt, sgn, bonusOpen, untilText, clockText } from "./store.js";
import { CHALLENGES, CATEGORIES } from "./challenges.js";
import { HUNT_TITLE } from "./config.js";

const app = document.getElementById("app");
const TEAM_KEY = "hunt-my-team";
let state = { teams: [], awards: [], bonuses: [] };

const ui = {
  q: "",
  cat: "all",
  sort: "cat",   // cat | high | low
  team: (() => { try { return localStorage.getItem(TEAM_KEY) || ""; } catch { return ""; } })(),
  hideDone: false,
};

const CAT_LABEL = Object.fromEntries(CATEGORIES);
const ORDER = CATEGORIES.map(([k]) => k).filter((k) => k !== "all");
const total = CHALLENGES.filter((c) => c.pts > 0 && !c.unit).reduce((s, c) => s + c.pts, 0);

function header() {
  return `<header class="top"><div class="brand"><h1>${esc(HUNT_TITLE)}</h1><span>Challenges</span></div>
    <nav class="tabs"><a href="index.html">Board</a><a href="challenges.html" aria-current="page">Challenges</a></nav></header>`;
}

// Shell renders once; regions update so typing in search never loses focus.
function renderShell() {
  app.innerHTML = `<div class="wrap">${header()}
    <div id="fire"></div>
    <section class="cl-tools">
      <input class="field" id="q" type="search" placeholder="Search ${CHALLENGES.length} challenges" autocomplete="off">
      <div class="cl-row">
        <label class="lab" for="team">Your team<select class="field" id="team"></select></label>
        <label class="lab" for="sort">Sort<select class="field" id="sort">
          <option value="cat">By category</option><option value="high">Most points</option><option value="low">Fewest points</option>
        </select></label>
        <label class="cl-check" id="hidewrap" hidden><input type="checkbox" id="hide"> Hide done</label>
      </div>
      <div class="chips" id="chips"></div>
    </section>
    <div id="progress"></div>
    <div id="list"></div>
    <footer class="foot">Points are awarded by the host once you show proof. Single challenges add up to ${fmt(total)} points, before per-item bonuses.</footer>
  </div>`;
  $("sort").value = ui.sort;
  update();
}

const $ = (id) => document.getElementById(id);

function doneMap() {
  const m = {};
  if (!ui.team) return m;
  state.awards.forEach((a) => {
    if (a.teamId !== ui.team || !a.cid) return;
    m[a.cid] = (m[a.cid] || 0) + 1;
  });
  return m;
}

function update() {
  // Team picker
  const teamSel = $("team");
  if (state.teams.length && ui.team && !state.teams.some((t) => t.id === ui.team)) ui.team = "";
  const sig = state.teams.map((t) => t.id + ":" + t.name).join("|") + "#" + ui.team;
  if (teamSel.dataset.sig !== sig) { // only rebuild when teams change, so an open picker isn't reset by a refresh
    teamSel.innerHTML = `<option value="">${state.teams.length ? "Pick your team" : "No teams yet"}</option>` +
      state.teams.map((t) => `<option value="${esc(t.id)}"${t.id === ui.team ? " selected" : ""}>${esc(t.name)}</option>`).join("");
    teamSel.dataset.sig = sig;
  }
  teamSel.disabled = !state.teams.length;
  $("hidewrap").hidden = !ui.team;

  // Category chips
  $("chips").innerHTML = CATEGORIES.map(([k, l]) =>
    `<button class="chip" data-cat="${k}" aria-pressed="${ui.cat === k}">${l}</button>`).join("");

  // Live fire sales
  const hot = (state.bonuses || []).filter((b) => bonusOpen(b));
  const done = doneMap();
  $("fire").innerHTML = hot.length
    ? `<section class="firesale" aria-label="Fire sales"><div class="fs-head"><span class="fs-tag">Fire sale</span>
        <span class="fs-sub">Limited time · worth extra</span></div>` +
      hot.map((b) => `<div class="fs-item"><div class="fs-name">${esc(b.name)}${done["b:" + b.id] ? ` <span class="done">✓ done</span>` : ""}</div>
        <div class="fs-pts">+${fmt(b.pts)}</div>
        <div class="fs-when">${b.ends ? `Ends ${clockText(b.ends)} · <span data-until="${b.ends}">${untilText(b.ends)}</span>` : "Open now"}</div></div>`).join("") +
      `</section>`
    : "";

  // Progress for the chosen team
  const team = state.teams.find((t) => t.id === ui.team);
  if (team) {
    const countable = CHALLENGES.filter((c) => c.cat !== "penalty");
    const n = countable.filter((c) => done[c.id]).length;
    const pts = state.awards.filter((a) => a.teamId === team.id).reduce((s, a) => s + (Number(a.points) || 0), 0);
    $("progress").innerHTML = `<div class="cl-progress" style="--team:${esc(team.color)}">
      <div><b>${esc(team.name)}</b><span>${n} of ${countable.length} done · ${fmt(pts)} pts</span></div>
      <div class="bar"><b style="width:${Math.round((n / countable.length) * 100)}%"></b></div></div>`;
  } else $("progress").innerHTML = "";

  renderList(done);
}

function row(c, done) {
  const d = done[c.id];
  const per = c.unit ? `<span class="u">${c.pts < 0 ? "" : "+"}${fmt(c.pts)} per ${esc(c.unit)}</span>` : "";
  return `<li class="cl-item${d ? " is-done" : ""}${c.pts < 0 ? " is-pen" : ""}">
    <span class="n">${esc(c.name)}${per}</span>
    ${d ? `<span class="done">✓${d > 1 ? " " + d + "×" : ""}</span>` : "<span></span>"}
    <span class="v${c.pts < 0 ? " neg" : ""}">${c.unit ? (c.pts < 0 ? fmt(c.pts) : "+" + fmt(c.pts)) + "<small>ea</small>" : sgn(c.pts)}</span></li>`;
}

function renderList(done) {
  const q = ui.q.trim().toLowerCase();
  let list = CHALLENGES.filter((c) =>
    (ui.cat === "all" || c.cat === ui.cat) &&
    (!q || c.name.toLowerCase().includes(q)) &&
    !(ui.hideDone && done[c.id]));

  if (!list.length) {
    $("list").innerHTML = `<div class="empty">${q ? `No challenge matches “${esc(ui.q)}”.` : "Nothing left here. Nice work."}</div>`;
    return;
  }

  if (ui.sort === "cat") {
    $("list").innerHTML = ORDER.map((cat) => {
      const items = list.filter((c) => c.cat === cat);
      if (!items.length) return "";
      return `<section class="cl-group"><p class="eyebrow">${esc(CAT_LABEL[cat])} · ${items.length}</p>
        <ul class="cl-list">${items.map((c) => row(c, done)).join("")}</ul></section>`;
    }).join("");
  } else {
    list = list.slice().sort((a, b) => ui.sort === "high" ? b.pts - a.pts : a.pts - b.pts);
    $("list").innerHTML = `<section class="cl-group"><ul class="cl-list">${list.map((c) => row(c, done)).join("")}</ul></section>`;
  }
}

document.addEventListener("input", (e) => {
  if (e.target.id === "q") { ui.q = e.target.value; renderList(doneMap()); }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "team") {
    ui.team = el.value;
    try { ui.team ? localStorage.setItem(TEAM_KEY, ui.team) : localStorage.removeItem(TEAM_KEY); } catch {}
    update();
  } else if (el.id === "sort") { ui.sort = el.value; renderList(doneMap()); }
  else if (el.id === "hide") { ui.hideDone = el.checked; renderList(doneMap()); }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (!b) return;
  ui.cat = b.dataset.cat; update();
});

setInterval(() => {
  document.querySelectorAll("[data-until]").forEach((n) => (n.textContent = untilText(Number(n.dataset.until))));
}, 15000);

renderShell();
getStore().then((store) => {
  store.subscribe((s) => { state = s; update(); }, () => {});
}).catch(() => {}); // the static list still works without live data
