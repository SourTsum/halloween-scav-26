// Public leaderboard (index.html). Read-only, updates live.
import { getStore, mode, standings, esc, fmt, sgn, ago } from "./store.js";
import { CHALLENGES } from "./challenges.js";
import { HUNT_TITLE, POLL_SECONDS } from "./config.js";

const app = document.getElementById("app");
let state = null;
let online = true;
let error = null;

const penalties = CHALLENGES.filter((c) => c.cat === "penalty");

function header() {
  const cls = state && state.finished ? " final" : online ? "" : " off";
  const label = state && state.finished ? "Final" : online ? "Live" : "Reconnecting";
  return `<header class="top"><div class="brand"><h1>${esc(HUNT_TITLE)}</h1><span>Leaderboard</span></div>
    <span class="status${cls}"><i></i>${label}</span>
    ${mode === "github" && state && state.updated ? `<span class="saving">Updated <span data-ts="${state.updated}">${ago(state.updated)}</span></span>` : ""}</header>`;
}

function render() {
  if (!state) return;
  const st = standings(state);
  const max = Math.max(1, st.length ? st[0].pts : 1);
  let h = `<div class="wrap">${header()}`;
  if (mode === "demo") {
    h += `<div class="banner">Demo mode: scores are saved in this browser only. See README.md to go live.</div>`;
  }
  if (error) h += `<div class="banner">Can’t read scores right now: ${esc(error)}</div>`;

  h += `<div class="board"><section style="min-width:0">`;
  if (state.finished && st.length) {
    h += `<div class="champ"><div class="crown">Hunt champions</div><h2>${esc(st[0].t.name)}</h2><div class="pts">${fmt(st[0].pts)}</div></div>`;
  }
  h += `<p class="eyebrow">Standings · ${st.length} team${st.length === 1 ? "" : "s"}</p>`;
  if (!st.length) {
    h += `<div class="empty"><strong>No teams yet</strong>Teams show up here as soon as the host adds them. This page updates on its own.</div>`;
  } else {
    h += `<ol class="rows">` + st.map((x, i) => {
      const w = x.pts > 0 ? Math.round((x.pts / max) * 100) : 0;
      return `<li class="row r${i + 1}" style="--team:${esc(x.t.color)}"><div class="rank">${i + 1}</div>
        <div style="min-width:0"><div class="tname">${esc(x.t.name)}</div><div class="tmeta">${x.n} challenge${x.n === 1 ? "" : "s"} done</div></div>
        <div class="tpts${x.pts < 0 ? " neg" : ""}">${fmt(x.pts)}<small>PTS</small></div>
        <div class="bar"><b style="width:${w}%"></b></div></li>`;
    }).join("") + `</ol>`;
  }

  const teamById = Object.fromEntries(state.teams.map((t) => [t.id, t]));
  const recent = state.awards.filter((a) => teamById[a.teamId]).slice(0, 12);
  h += `</section><aside class="side"><section><p class="eyebrow">Latest</p>`;
  if (!recent.length) {
    h += `<div class="empty" style="padding:20px">Completed challenges will appear here.</div>`;
  } else {
    h += `<ul class="feed">` + recent.map((a) => {
      const t = teamById[a.teamId];
      return `<li style="--team:${esc(t.color)}"><span class="dot"></span><div style="min-width:0">
        <div class="what">${esc(a.label)}</div><div class="who">${esc(t.name)} · <span data-ts="${a.ts}">${ago(a.ts)}</span></div></div>
        <span class="p${a.points < 0 ? " neg" : ""}">${sgn(a.points)}</span></li>`;
    }).join("") + `</ul>`;
  }
  h += `</section><section class="rules"><p class="eyebrow">Penalties</p><ul>` +
    penalties.map((c) => `<li>${esc(c.name)}: ${fmt(c.pts)}${c.unit ? " each" : ""}</li>`).join("") +
    `</ul></section></aside></div><footer class="foot">${mode === "github" ? `Scores refresh every ${POLL_SECONDS} seconds. ` : ""}<a href="host.html">Host login</a></footer></div>`;
  app.innerHTML = h;
}

setInterval(() => {
  document.querySelectorAll("[data-ts]").forEach((n) => (n.textContent = ago(Number(n.dataset.ts))));
}, 30000);

getStore().then((store) => {
  store.onConnection((c) => { online = c; render(); });
  store.subscribe(
    (s) => { state = s; error = null; render(); },
    (e) => { error = e && e.message ? e.message : "permission denied"; state = state || { finished: false, teams: [], awards: [] }; render(); },
  );
}).catch((e) => {
  app.innerHTML = `<div class="wrap"><div class="banner">Couldn’t load the scoreboard: ${esc(e.message || e)}</div></div>`;
});
