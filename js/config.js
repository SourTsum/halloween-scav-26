// ─────────────────────────────────────────────────────────────
// Where scores live:
//   "github"   – scores are a static data.json in this repo. The host page
//                commits changes via the GitHub API; the board polls the file.
//                No other service needed. Updates show in ~30–90 s.
//   "firebase" – instant live updates via Firebase Realtime Database
//                (fill in firebaseConfig below; see README.md).
// ─────────────────────────────────────────────────────────────
export const BACKEND = "github";

// Shown in the page header.
export const HUNT_TITLE = "Halloween Scavenger Hunt";

// GitHub mode. On <owner>.github.io/<repo>/ the owner and repo are detected
// automatically, so you can leave these as-is. Set them for a custom domain.
export const github = {
  owner: "SourTsum",
  repo: "halloween-scav-26",
  branch: "main",
  path: "data.json",
};

// How often the public board re-checks for new scores (seconds).
export const POLL_SECONDS = 20;

// How long the host page waits after your last tap before committing (seconds).
// Taps inside this window are grouped into one commit.
export const COMMIT_DELAY_SECONDS = 4;

// Firebase mode only. These values are not secret; security comes from
// database.rules.json.
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://PASTE_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

// Firebase mode: path inside the database.
export const HUNT_PATH = "hunt";
