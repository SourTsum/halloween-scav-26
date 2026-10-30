// Data layer. Three backends share one interface:
//   github   – data.json in the repo; host commits via the GitHub API, board polls
//   firebase – Firebase Realtime Database (instant)
//   demo     – localStorage in this browser (syncs between tabs)
import {
  BACKEND, firebaseConfig, HUNT_PATH, github, POLL_SECONDS, COMMIT_DELAY_SECONDS,
} from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const fbConfigured =
  !!firebaseConfig && !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE");

// Resolve owner/repo for GitHub mode (auto-detected on *.github.io).
function ghTarget() {
  const host = location.hostname;
  const onPages = host.endsWith(".github.io");
  let owner = github.owner || (onPages ? host.split(".")[0] : "");
  let repo = github.repo;
  if (!repo && onPages) {
    const seg = location.pathname.split("/").filter(Boolean)[0];
    repo = seg && !seg.endsWith(".html") ? seg : host; // user site: <owner>.github.io
  }
  return { owner, repo, branch: github.branch || "main", path: github.path || "data.json" };
}
const GH = ghTarget();
const ghReady = !!(GH.owner && GH.repo);

// "github" without a resolvable repo (e.g. local testing) still reads data.json,
// but the host can't commit, so the host desk falls back to demo.
export const mode =
  BACKEND === "firebase" ? (fbConfigured ? "firebase" : "demo")
  : BACKEND === "github" ? "github"
  : "demo";
export const repoLabel = ghReady ? `${GH.owner}/${GH.repo}` : "";
export const canCommit = mode !== "github" || ghReady;

// Raw value -> { finished, updated, teams: [...], awards: [...] }
function normalize(v) {
  v = v || {};
  const teams = Object.entries(v.teams || {})
    .map(([id, t]) => ({ id, ...t }))
    .sort((a, b) => (a.created || 0) - (b.created || 0));
  const awards = Object.entries(v.awards || {})
    .map(([id, a]) => ({ id, ...a }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const bonuses = Object.entries(v.bonuses || {})
    .map(([id, b]) => ({ id, ...b }))
    .sort((a, b) => (b.created || 0) - (a.created || 0));
  return {
    finished: !!(v.meta && v.meta.finished),
    updated: (v.meta && v.meta.updated) || null,
    teams, awards, bonuses,
  };
}

let storePromise = null;
export function getStore({ host = false } = {}) {
  if (!storePromise) {
    if (mode === "firebase") storePromise = firebaseStore();
    else if (mode === "github" && (!host || ghReady)) storePromise = Promise.resolve(githubStore(host));
    else storePromise = Promise.resolve(demoStore());
  }
  return storePromise;
}

/* ---------------- GitHub (static data.json) ---------------- */
function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromB64(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
const clone = (v) => JSON.parse(JSON.stringify(v || {}));

function githubStore(isHost) {
  const TOKEN_KEY = "hunt-gh-token";
  const getTok = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setTok = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };
  let token = isHost ? getTok() : null;

  let base = {};          // last known committed data
  let sha = null;         // blob sha of data.json on the branch
  let pending = [];       // local ops not yet committed
  let saving = false, timer = null, pollTimer = null;
  let online = true;
  const subs = new Set(), connSubs = new Set(), authSubs = new Set(), statusSubs = new Set();
  let status = { state: "saved" };

  const view = () => { const v = clone(base); pending.forEach((op) => op(v)); return v; };
  const emit = () => { const n = normalize(view()); subs.forEach((cb) => cb(n)); };
  const setOnline = (o) => { if (o !== online) { online = o; connSubs.forEach((cb) => cb(o)); } };
  const setStatus = (s) => { status = s; statusSubs.forEach((cb) => cb(s)); };

  const apiUrl = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${GH.path}`;
  const headers = () => ({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  });

  async function loadRemote() {
    if (token) {
      const r = await fetch(`${apiUrl}?ref=${encodeURIComponent(GH.branch)}&t=${Date.now()}`, { headers: headers(), cache: "no-store" });
      if (r.status === 404) { base = {}; sha = null; return; }
      if (!r.ok) { const e = new Error(`GitHub said ${r.status}`); e.status = r.status; throw e; }
      const j = await r.json();
      sha = j.sha;
      base = j.content ? JSON.parse(fromB64(j.content) || "{}") : {};
    } else {
      // Public board: read the deployed file, cache-busted past the Pages CDN.
      const r = await fetch(`${GH.path}?t=${Date.now()}`, { cache: "no-store" });
      if (r.status === 404) { base = {}; return; }
      if (!r.ok) throw new Error(`Couldn’t load ${GH.path} (${r.status})`);
      base = await r.json();
    }
  }

  async function refresh() {
    if (saving || pending.length) return; // never clobber unsaved local changes
    try { await loadRemote(); setOnline(true); emit(); }
    catch (e) { setOnline(false); if (e.status === 401) signOutLocal(); }
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(refresh, Math.max(5, POLL_SECONDS) * 1000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

  function schedule(delay = COMMIT_DELAY_SECONDS * 1000) {
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }

  async function flush() {
    clearTimeout(timer);
    if (saving || !pending.length || !token) return;
    saving = true;
    setStatus({ state: "saving", count: pending.length });
    const ops = pending.slice();
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const next = clone(base);
        ops.forEach((op) => op(next));
        next.meta = { ...(next.meta || {}), updated: Date.now() };
        const body = {
          message: `Score update (${ops.length} change${ops.length === 1 ? "" : "s"})`,
          content: toB64(JSON.stringify(next, null, 1) + "\n"),
          branch: GH.branch,
        };
        if (sha) body.sha = sha;
        const r = await fetch(apiUrl, { method: "PUT", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (r.ok) {
          const j = await r.json();
          sha = j.content && j.content.sha;
          base = next;
          pending.splice(0, ops.length);
          setOnline(true);
          setStatus({ state: pending.length ? "pending" : "saved", count: pending.length, at: Date.now() });
          return;
        }
        if (r.status === 409 || r.status === 422) { await loadRemote(); continue; } // file changed: rebase and retry
        if (r.status === 401) { signOutLocal(); throw new Error("Your GitHub token was rejected. Sign in again."); }
        if (r.status === 403 || r.status === 404) throw new Error("This token can’t write to " + repoLabel + ". It needs Contents: Read and write on this repo.");
        throw new Error(`GitHub said ${r.status}`);
      }
      throw new Error("The file kept changing underneath us. Try Publish now again.");
    } catch (e) {
      setOnline(false);
      setStatus({ state: "error", count: pending.length, message: e.message || String(e) });
    } finally {
      saving = false;
      emit();
      if (pending.length && status.state !== "error") schedule(1000);
    }
  }

  window.addEventListener("beforeunload", (e) => {
    if (pending.length || saving) { e.preventDefault(); e.returnValue = ""; }
  });

  const mutate = (op) => {
    pending.push(op);
    emit();
    setStatus({ state: "pending", count: pending.length });
    schedule();
    return Promise.resolve();
  };
  const uid = () => "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const who = () => ({ email: `GitHub · ${repoLabel}`, uid: "gh" });

  function signOutLocal() {
    token = null; setTok(null);
    authSubs.forEach((cb) => cb(null));
  }

  // Boot
  (async () => {
    try { await loadRemote(); setOnline(true); }
    catch (e) { setOnline(false); if (e.status === 401) { token = null; setTok(null); } }
    emit();
    startPolling();
  })();

  return {
    mode: "github",
    subscribe(cb) { subs.add(cb); cb(normalize(view())); return () => subs.delete(cb); },
    onConnection(cb) { connSubs.add(cb); cb(online); return () => connSubs.delete(cb); },
    onSaveStatus(cb) { statusSubs.add(cb); cb(status); return () => statusSubs.delete(cb); },
    onAuth(cb) { authSubs.add(cb); cb(token ? who() : null); return () => authSubs.delete(cb); },
    async signIn(tok) {
      tok = (tok || "").trim();
      const r = await fetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${tok}` },
      });
      if (!r.ok) throw new Error(r.status === 401 ? "GitHub rejected that token." : `Can’t see ${repoLabel} with that token (${r.status}).`);
      const j = await r.json();
      if (j.permissions && !j.permissions.push) throw new Error(`That token can read ${repoLabel} but not write to it.`);
      token = tok; setTok(tok);
      await loadRemote(); emit();
      authSubs.forEach((cb) => cb(who()));
    },
    signOut() { signOutLocal(); return Promise.resolve(); },
    publishNow() { return flush(); },

    async addTeam(team) {
      const k = uid();
      await mutate((v) => { (v.teams ||= {})[k] = { name: team.name, color: team.color, created: Date.now() }; });
      return k;
    },
    renameTeam: (tid, name) => mutate((v) => { if (v.teams && v.teams[tid]) v.teams[tid].name = name; }),
    deleteTeam: (tid, awardIds) => mutate((v) => {
      if (v.teams) delete v.teams[tid];
      awardIds.forEach((a) => v.awards && delete v.awards[a]);
    }),
    addAward: (a) => { const k = uid(); return mutate((v) => { (v.awards ||= {})[k] = a; }); },
    removeAward: (aid) => mutate((v) => { if (v.awards) delete v.awards[aid]; }),
    setFinished: (f) => mutate((v) => { (v.meta ||= {}).finished = !!f; }),
    addBonus: (b) => { const k = uid(); return mutate((v) => { (v.bonuses ||= {})[k] = b; }).then(() => k); },
    endBonus: (bid) => mutate((v) => { if (v.bonuses && v.bonuses[bid]) v.bonuses[bid].active = false; }),
    deleteBonus: (bid) => mutate((v) => { if (v.bonuses) delete v.bonuses[bid]; }),
    reset: () => mutate((v) => { v.teams = {}; v.awards = {}; v.bonuses = {}; v.meta = { finished: false }; }),
  };
}

async function firebaseStore() {
  const [{ initializeApp }, dbm, authm] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-database.js"),
    import(FB + "firebase-auth.js"),
  ]);
  const { getDatabase, ref, onValue, push, set, update, remove } = dbm;
  const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } = authm;

  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const auth = getAuth(app);
  const path = (p) => ref(db, p ? `${HUNT_PATH}/${p}` : HUNT_PATH);

  return {
    mode: "firebase",
    subscribe(cb, onError) {
      return onValue(path(), (s) => cb(normalize(s.val())), (e) => onError && onError(e));
    },
    onConnection(cb) {
      return onValue(ref(db, ".info/connected"), (s) => cb(!!s.val()));
    },
    onAuth(cb) {
      return onAuthStateChanged(auth, (u) => cb(u ? { email: u.email, uid: u.uid } : null));
    },
    signIn: (email, pw) => signInWithEmailAndPassword(auth, email, pw),
    signOut: () => signOut(auth),

    async addTeam(team) {
      const r = push(path("teams"));
      await set(r, { name: team.name, color: team.color, created: Date.now() });
      return r.key;
    },
    renameTeam: (id, name) => update(path(`teams/${id}`), { name }),
    deleteTeam(id, awardIds) {
      const u = { [`teams/${id}`]: null };
      awardIds.forEach((a) => (u[`awards/${a}`] = null));
      return update(path(), u);
    },
    addAward: (a) => set(push(path("awards")), a),
    removeAward: (id) => remove(path(`awards/${id}`)),
    setFinished: (v) => update(path("meta"), { finished: !!v }),
    async addBonus(b) { const r = push(path("bonuses")); await set(r, b); return r.key; },
    endBonus: (bid) => update(path(`bonuses/${bid}`), { active: false }),
    deleteBonus: (bid) => remove(path(`bonuses/${bid}`)),
    reset: () => set(path(), { meta: { finished: false } }),
  };
}

function demoStore() {
  const KEY = "scavenger-hunt-demo:" + HUNT_PATH;
  const subs = new Set();
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
  };
  const write = (v) => {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {}
    const n = normalize(v);
    subs.forEach((cb) => cb(n));
  };
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) { const n = normalize(read()); subs.forEach((cb) => cb(n)); }
  });
  const id = () => "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const mut = (fn) => { const v = read(); fn(v); write(v); return Promise.resolve(); };

  return {
    mode: "demo",
    subscribe(cb) { subs.add(cb); cb(normalize(read())); return () => subs.delete(cb); },
    onConnection(cb) { cb(true); return () => {}; },
    onAuth(cb) { cb({ email: "demo mode", uid: "demo" }); return () => {}; },
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),

    async addTeam(team) {
      const k = id();
      await mut((v) => { (v.teams ||= {})[k] = { name: team.name, color: team.color, created: Date.now() }; });
      return k;
    },
    renameTeam: (tid, name) => mut((v) => { if (v.teams && v.teams[tid]) v.teams[tid].name = name; }),
    deleteTeam: (tid, awardIds) => mut((v) => {
      if (v.teams) delete v.teams[tid];
      awardIds.forEach((a) => v.awards && delete v.awards[a]);
    }),
    addAward: (a) => mut((v) => { (v.awards ||= {})[id()] = a; }),
    removeAward: (aid) => mut((v) => { if (v.awards) delete v.awards[aid]; }),
    setFinished: (f) => mut((v) => { (v.meta ||= {}).finished = !!f; }),
    async addBonus(b) { const k = id(); await mut((v) => { (v.bonuses ||= {})[k] = b; }); return k; },
    endBonus: (bid) => mut((v) => { if (v.bonuses && v.bonuses[bid]) v.bonuses[bid].active = false; }),
    deleteBonus: (bid) => mut((v) => { if (v.bonuses) delete v.bonuses[bid]; }),
    reset: () => mut((v) => { v.teams = {}; v.awards = {}; v.bonuses = {}; v.meta = { finished: false }; }),
  };
}

// Shared helpers
export function standings(state) {
  const rows = state.teams.map((t) => ({ t, pts: 0, n: 0 }));
  const by = Object.fromEntries(rows.map((r) => [r.t.id, r]));
  state.awards.forEach((a) => {
    const r = by[a.teamId];
    if (r) { r.pts += Number(a.points) || 0; if (a.points > 0) r.n++; }
  });
  return rows.sort((a, b) => b.pts - a.pts || a.t.name.localeCompare(b.t.name));
}

// A bonus is open while it's active and its deadline (if any) hasn't passed.
export const bonusOpen = (b, now = Date.now()) => b.active !== false && (!b.ends || b.ends > now);

export function untilText(ts, now = Date.now()) {
  const m = Math.ceil((ts - now) / 60000);
  if (m <= 0) return "ended";
  if (m < 60) return `${m} min left`;
  return `${Math.floor(m / 60)}h ${m % 60}m left`;
}

export const clockText = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n) => (n < 0 ? "−" : "") + Math.abs(n).toLocaleString();
export const sgn = (n) => (n > 0 ? "+" : "") + fmt(n);
export function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return m + " min ago";
  return Math.floor(m / 60) + "h " + (m % 60) + "m ago";
}
