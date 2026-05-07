# GameTeam 🎮

A collection of real-time multiplayer browser games for company teams — built with vanilla JS + Firebase Firestore, deployed on GitHub Pages.

---

## Games

### 🔍 [ZoomGame — Zoom Guess Battle Multiplayer](./ZoomGame/)

A real-time multiplayer guessing game:
- All players see the same zoomed & blurred image
- Type your guess — first correct answer wins the round
- Live leaderboard, round timer, and hints

**Play:** `https://quyxq2002.github.io/GameTeam/ZoomGame/`

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | HTML · CSS · Vanilla JS (ES Modules) |
| Backend | Firebase Firestore (real-time sync) |
| Hosting | GitHub Pages |

---

## Setup

### 1. Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/project/zoomgame-2002)
2. Enable **Firestore Database** in test mode
3. Copy your web app config values

### 2. Configure firebase.js

Edit `ZoomGame/firebase.js` and fill in your actual Firebase config values:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "zoomgame-2002.firebaseapp.com",
  projectId: "zoomgame-2002",
  storageBucket: "zoomgame-2002.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 3. Deploy to GitHub Pages

- Push this repo to `https://github.com/quyxq2002/GameTeam`
- Go to **Settings → Pages → Source: main branch / root**
- Game will be live at `https://quyxq2002.github.io/GameTeam/ZoomGame/`

---

## Firestore Rules (Testing)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ Switch to authenticated rules before production use.

---

## Adding Future Games

Add a new folder (e.g. `MemoryGame/`) with its own `index.html`, `app.js`, `style.css`, `firebase.js`. Each game is fully self-contained.
