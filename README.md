# Halloween Hunt Scoreboard

A scavenger-hunt leaderboard that runs entirely on GitHub Pages.

- **`index.html`**: public leaderboard. Share this link.
- **`challenges.html`**: the full challenge list for players, with search, sorting, live fire sales, and a team picker that ticks off what that team has done.
- **`host.html`**: host desk. Add teams, award challenges, undo mistakes, crown the winner.

Scores live in **`data.json`** in this repo. When you award points on the host desk,
it commits the new `data.json` through the GitHub API. The commit triggers a Pages
deploy, and the public board re-checks the file every 20 seconds. Expect changes to
appear on the board **about 30–90 seconds** after you tap.

Taps made within a few seconds of each other are grouped into one commit.
The host desk shows the save state at the top: *changes waiting*, *committing*, or *saved*.

## Files

```
index.html                    public leaderboard
host.html                     host desk
challenges.html               challenge list for players
data.json                     the scores (the host desk commits this)
css/style.css                 styles
js/config.js                  settings: backend, title, poll and commit timing
js/challenges.js              challenge list and points
js/store.js                   data layer (GitHub, Firebase, or demo)
js/board.js                   leaderboard page
js/host.js                    host page
js/challenges-page.js         challenge list page
.github/workflows/pages.yml   deploys to Pages on every push
database.rules.json           only used for the optional Firebase mode
.nojekyll                     serve files as-is
```

## Setup (about 5 minutes)

### 1. Push to GitHub
```bash
cd scavenger-hunt
git init && git add . && git commit -m "Scavenger hunt scoreboard"
git branch -M main
git remote add origin https://github.com/<you>/scavenger-hunt.git
git push -u origin main
```
The repo must be **public** on a free account, since Pages needs that.

### 2. Turn on Pages with GitHub Actions
In the repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The included workflow deploys on every push. Branch-based builds are capped at about
10 per hour; Actions deploys are not, so leave this set to Actions.
After the first run, your site is at `https://<you>.github.io/scavenger-hunt/`.

### 3. Make a token for the host desk
1. Open <https://github.com/settings/personal-access-tokens/new>.
2. **Repository access → Only select repositories →** `scavenger-hunt`.
3. **Permissions → Repository → Contents: Read and write**. Nothing else is needed.
4. Set the expiration to a few days. Generate the token and copy it.
5. Open `host.html` on your phone and paste the token.

The token is saved only in that browser and only sent to `api.github.com`.
It can't touch anything except this one repo. Revoke it after the party.
**Sign out** on the host desk removes it from the browser.

Owner and repo are detected from the `*.github.io` URL. On a custom domain, set them
in `js/config.js`.

## Running the hunt
- **Award:** pick a team, then tap a challenge. Use the counter for per-unit items
  (bridge +35/person, dryer rocks +5/machine, liquor 50/can or 200/bottle,
  nameplates 8 each, sober −100/member, saying Alex's name −25 each).
  Use **Custom points** to override any value.
- **Custom award:** type what it's for and the points, and it goes to the selected team.
  Use a negative number for a deduction.
- **Fire sale:** type a bonus challenge, its points, and how long it lasts, then tap
  **Post fire sale**. It appears in a highlighted banner at the top of the public board
  and at the top of your challenge list (under *Fire sales*), so you can award it like
  any other challenge. It drops off the board when time runs out, or when you tap **End**.
  - **Text it** opens your phone's share sheet with the announcement written for you.
    Pick your group chat and send. If the share sheet isn't available, it opens Messages
    instead. **Copy message** copies the text so you can paste it anywhere.
  - Anyone with the board open sees the banner, and their tab title changes. If they
    tapped **Alert me**, they also get a browser notification (Android and desktop; on
    iPhone only when the board is added to the home screen).
  - A static site can't send texts by itself, which is why the text goes through your phone.
- **Publish now** commits immediately instead of waiting for the short pause.
- **Undo:** use the **×** next to an entry in *Recent awards*.
- **End hunt & crown winner:** shows a champion banner on the board after the next deploy.
- **Reset everything:** wipes teams and awards. It asks you to confirm first.
- Don't close the host tab while it says *changes waiting*. The browser will warn you.
- You can also edit `data.json` by hand on github.com in a pinch. The host desk picks up
  the change within 20 seconds.

## Changing challenges
Edit `js/challenges.js`. Each row is `[category, name, points, unit?]`.
Challenge ids come from list position, so once awards exist, add new rows at the
**end** of the list. Award labels and points are stored on each award, so totals stay
correct either way.

## Local testing
```bash
python -m http.server 8000
# open http://localhost:8000/host.html and http://localhost:8000/
```
On localhost the host desk can't tell which repo to commit to, so it runs in
**demo mode**: data stays in your browser and syncs between tabs.

## Optional: instant updates with Firebase
Set `BACKEND = "firebase"` in `js/config.js` and fill in `firebaseConfig`. Then:
1. Create a Firebase project and a Realtime Database in locked mode.
2. Enable Authentication with Email/Password, add a host user, and copy its UID.
3. Add `<you>.github.io` under Authentication → Settings → Authorized domains.
4. Put the UID in `database.rules.json` and publish those rules in the console.

The host desk then signs in with email and password, and the board updates instantly.
