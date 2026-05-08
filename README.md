# GameTeam — Zoom Guess (ZoomGame)

Zoom Guess is a lightweight, browser-based real-time multiplayer guessing game designed for quick team sessions (Zoom/Meet). Players see the same blurred & zoomed image and race to type the correct answer. The first correct guess wins the round.

Live demo (if deployed): https://quyxq2002.github.io/GameTeam/ZoomGame/

Repository structure
- `ZoomGame/` — main game (HTML/JS/CSS/assets)
- `assets/` — images & sounds used by games
- `README.md` — this file

Key features
- Local-first image assets (stored in `ZoomGame/assets/images/`)
- Smooth zoom-and-reveal animation with progressive hints
- Real-time gameplay using Firebase Firestore (optional)
- Emoji reactions, instant guess feedback, dynamic podium by player count
- Web Audio API for sound effects

Quick start (local)

1. Clone the repository and open the game folder:

```bash
git clone https://github.com/quyxq2002/GameTeam.git
cd GameTeam/ZoomGame
```

2. Serve the folder locally (any simple static server will do):

```bash
# Python 3 built-in server
python -m http.server 5500

# OR using npm (http-server)
npx http-server -p 5500
```

Then open `http://localhost:5500` in a browser and load `index.html`.

Firebase configuration (optional)

- This project supports using Firebase Firestore for real-time sync. Development/test project ID: `zoomgame-2002`.
- To enable Firestore for your copy:
  1. Create a Firebase project and a Web app in the Firebase Console.
  2. Enable Firestore and set rules appropriate for testing or production.
  3. Copy the generated config object into `ZoomGame/firebase.js` (replace placeholders).

Example `ZoomGame/firebase.js` snippet (replace with your own keys):

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "zoomgame-2002",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

Security note: Do not commit private service-account keys or server credentials. Client-side Firebase config is intended for browser apps and is safe to include.

Adding images

- Add new images to `ZoomGame/assets/images/<category>/`.
- Filenames are used as keywords by `data.js`; use short, descriptive names.

Deploy

- Deploy to GitHub Pages via repository Settings → Pages, or configure a CI workflow to publish the `ZoomGame/` folder.

Purge old README from git history (optional)

If you need to remove historical `README.md` content from the repository history, note this rewrites history and requires a forced push. Use `git filter-repo` or the BFG Repo-Cleaner; example (do not run unless you understand the consequences):

```bash
# using git-filter-repo (recommended)
git clone --mirror https://github.com/<you>/<repo>.git
cd repo.git
git filter-repo --path README.md --invert-paths
git push --force
```

Warning: Rewriting history affects all collaborators. Ask if you want me to perform this step and I will proceed after your confirmation.

Contributing

- Open issues or PRs to add features, images, or fixes. Keep changes small and describe behavior.

Contact

- Repo: https://github.com/quyxq2002/GameTeam

---

This README was updated to reflect current `ZoomGame` behavior and run/deploy instructions.
