# GameTeam — Zoom Guess (ZoomGame)

Zoom Guess is a lightweight, browser-based real-time multiplayer guessing game created for short team sessions. Players view the same blurred and zoomed image and race to enter the correct answer; the first correct guess wins the round.

Overview
- Gameplay: Progressive rounds where an image gradually reveals while players submit guesses. Immediate feedback, live leaderboard, and emoji reactions enhance social play.
- Audience: Casual team play during meetings, break-room sessions, or small events.

How to play
- Each round presents a zoomed, blurred image.
- Players type guesses into the input; the game validates answers and awards the round to the first correct guesser.
- Hints are provided progressively; the image fully reveals near round end while the hint keeps some characters hidden to preserve challenge.

Game modes & behavior
- Multiplayer (real-time): Optional Firestore-backed state enables synchronized rounds across browsers.
- Local/demo mode: Works with local assets and can run in a single browser for demos.
- Dynamic podium: The end-of-game podium adjusts depending on player count to keep results meaningful for small groups.

Key features
- Progressive hinting and smooth zoom/reveal animations
- Instant guess feedback and first-correct-wins scoring
- Emoji reactions with username labels
- Local-first image assets (organized by category)
- Lightweight frontend using vanilla JavaScript and the Web Audio API

Assets
- Images and sounds are stored under `ZoomGame/assets/`. Image categories include animals, cars, daily, food, fruits, logos, phones, and tech.

Technical summary
- Frontend: HTML, CSS, Vanilla JS (ES modules), Web Audio API
- Real-time sync (optional): Firebase Firestore
- Hosting: suitable for static hosts (GitHub Pages, etc.)

Privacy & data
- The game stores ephemeral game state when using Firestore; it does not collect personal data beyond player display names entered voluntarily.

Credits
- Maintained by the GameTeam contributors. See commit history for author details.

Repository
- Source: https://github.com/quyxq2002/GameTeam

License
- See the repository's `LICENSE` file for licensing details (if present).

This README provides an information-first summary of the Zoom Guess game without setup or deployment instructions.
