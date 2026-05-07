import { db } from "./firebase.js";
import {
  doc, collection, getDoc, setDoc, updateDoc,
  onSnapshot, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── State ───────────────────────────────────────────────────────────────────
let nickname = "";
let roomId   = "room1";
let unsubscribe = null;
let timerInterval = null;
let lastGuessTime = 0;        // anti-spam
let roundActive = false;
let myScore = 0;

// Sample image pool — replace with real hosted images or Firebase Storage URLs
const IMAGE_POOL = [
  { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Retriever_in_water.jpg/1280px-Retriever_in_water.jpg", answer: "dog" },
  { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Cat_November_2010-1a.jpg/1200px-Cat_November_2010-1a.jpg", answer: "cat" },
  { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Dog_Breeds.jpg/1200px-Dog_Breeds.jpg", answer: "dog" },
  { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", answer: "cat" },
  { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/1200px-Camponotus_flavomarginatus_ant.jpg", answer: "ant" },
  { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Felis_silvestris_silvestris_small_gradual_decrease_of_quality.png/1200px-Felis_silvestris_silvestris_small_gradual_decrease_of_quality.png", answer: "cat" },
  { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Culinary_fruits_front_view.jpg/1200px-Culinary_fruits_front_view.jpg", answer: "fruits" },
  { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Good_Food_Display_-_NCI_Visuals_Online.jpg/1200px-Good_Food_Display_-_NCI_Visuals_Online.jpg", answer: "food" },
];

// ─── DOM refs ────────────────────────────────────────────────────────────────
const joinScreen    = document.getElementById("join-screen");
const gameScreen    = document.getElementById("game-screen");
const nicknameInput = document.getElementById("nickname-input");
const roomInput     = document.getElementById("room-input");
const roomLabel     = document.getElementById("room-label");
const playerLabel   = document.getElementById("player-label");
const timerLabel    = document.getElementById("timer-label");
const gameImage     = document.getElementById("game-image");
const roundOverlay  = document.getElementById("round-overlay");
const roundAnswer   = document.getElementById("round-answer");
const hintBar       = document.getElementById("hint-bar");
const guessInput    = document.getElementById("guess-input");
const guessBtn      = document.getElementById("guess-btn");
const feedbackEl    = document.getElementById("feedback");
const leaderboardEl = document.getElementById("leaderboard");
const guessLogEl    = document.getElementById("guess-log");
const winnerBanner  = document.getElementById("winner-banner");
const soundCorrect  = document.getElementById("sound-correct");
const soundTick     = document.getElementById("sound-tick");

// ─── Join Game ───────────────────────────────────────────────────────────────
window.joinGame = async function () {
  const name = nicknameInput.value.trim();
  const room = roomInput.value.trim() || "room1";
  if (!name) { alert("Please enter a nickname."); return; }

  nickname = name;
  roomId   = room;

  const roomRef = doc(db, "game", roomId);
  const snap    = await getDoc(roomRef);

  if (!snap.exists()) {
    // First player — initialize room
    const chosen = pickRandomImage();
    await setDoc(roomRef, {
      currentImage:  chosen.url,
      correctAnswer: chosen.answer,
      hint:          buildHint(chosen.answer),
      zoomLevel:     8,
      status:        "playing",
      timer:         30,
      timerStart:    serverTimestamp(),
      scores:        {},
      guesses:       {},
      winner:        null,
    });
  }

  // Register score slot for this player
  const data = (await getDoc(roomRef)).data();
  if (data.scores[nickname] === undefined) {
    await updateDoc(roomRef, { [`scores.${nickname}`]: 0 });
  }

  // Switch screens
  joinScreen.classList.remove("active");
  gameScreen.classList.add("active");
  roomLabel.textContent   = `Room: ${roomId}`;
  playerLabel.textContent = `Player: ${nickname}`;

  listenRealtime();
};

// ─── Listen Realtime ─────────────────────────────────────────────────────────
function listenRealtime() {
  if (unsubscribe) unsubscribe();
  const roomRef = doc(db, "game", roomId);

  unsubscribe = onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();

    updateImage(data);
    updateTimer(data);
    updateLeaderboard(data.scores);
    updateGuessLog(data.guesses);
    updateHint(data.hint);

    if (data.status === "roundEnd") {
      showRoundEnd(data);
    } else {
      roundOverlay.classList.add("hidden");
      roundActive = true;
      winnerBanner.classList.add("hidden");
    }

    if (data.winner) {
      showWinnerBanner(data.winner);
    }
  });
}

// ─── Send Guess ──────────────────────────────────────────────────────────────
window.sendGuess = async function () {
  if (!roundActive) return;

  const now = Date.now();
  if (now - lastGuessTime < 2000) {
    setFeedback("⏳ Wait a moment before guessing again.", "wrong");
    return;
  }
  lastGuessTime = now;

  const guess = guessInput.value.trim().toLowerCase();
  if (!guess) return;
  guessInput.value = "";

  const roomRef = doc(db, "game", roomId);
  const snap    = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();

  if (data.status !== "playing") return;

  // Store guess
  await updateDoc(roomRef, { [`guesses.${nickname}`]: guess });

  if (guess === data.correctAnswer.toLowerCase()) {
    // Winner!
    const newScore = (data.scores[nickname] || 0) + 1;
    await updateDoc(roomRef, {
      status:  "roundEnd",
      winner:  nickname,
      [`scores.${nickname}`]: newScore,
    });
    playSound(soundCorrect);
    setFeedback("🎉 Correct! You won this round!", "correct");
  } else {
    setFeedback("❌ Wrong guess. Keep trying!", "wrong");
  }
};

// Enter key support
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && gameScreen.classList.contains("active")) {
    sendGuess();
  }
});

// ─── UI Helpers ──────────────────────────────────────────────────────────────
function updateImage(data) {
  if (data.currentImage && gameImage.src !== data.currentImage) {
    gameImage.src = data.currentImage;
  }
  const zoom = data.zoomLevel ?? 6;
  gameImage.style.transform = `scale(${zoom})`;
  gameImage.style.filter    = data.status === "roundEnd" ? "blur(0px)" : "blur(8px)";
  gameImage.style.objectFit = "cover";
}

function updateTimer(data) {
  if (!data.timerStart || data.status === "roundEnd") return;

  const started = data.timerStart.toMillis ? data.timerStart.toMillis() : Date.now();
  const elapsed = Math.floor((Date.now() - started) / 1000);
  const remaining = Math.max(0, (data.timer || 30) - elapsed);

  timerLabel.textContent = `⏱ ${remaining}s`;
  timerLabel.className   = "timer";
  if (remaining <= 10) timerLabel.classList.add("warn");
  if (remaining <= 5)  { timerLabel.classList.remove("warn"); timerLabel.classList.add("danger"); }

  // Auto end round when timer hits 0
  if (remaining <= 0 && data.status === "playing") {
    endRoundByTimeout(data);
  }
}

async function endRoundByTimeout(data) {
  const roomRef = doc(db, "game", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists() || snap.data().status !== "playing") return;
  await updateDoc(roomRef, { status: "roundEnd", winner: null });
}

function updateLeaderboard(scores) {
  if (!scores) return;
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  leaderboardEl.innerHTML = sorted.map(([name, score], i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
    const isMe  = name === nickname ? " me" : "";
    return `<div class="lb-row${isMe}"><span>${medal} ${escapeHtml(name)}</span><span class="score">${score}</span></div>`;
  }).join("");
}

function updateGuessLog(guesses) {
  if (!guesses) return;
  const entries = Object.entries(guesses).slice(-8).reverse();
  guessLogEl.innerHTML = entries.map(([name, guess]) =>
    `<div class="guess-entry"><span class="gname">${escapeHtml(name)}:</span> ${escapeHtml(guess)}</div>`
  ).join("");
}

function updateHint(hint) {
  hintBar.textContent = hint ? `Hint: ${hint}` : "";
}

function showRoundEnd(data) {
  roundActive = false;
  roundAnswer.textContent  = `✅ Answer: ${data.correctAnswer}`;
  roundOverlay.classList.remove("hidden");

  // Auto start next round after 4 seconds
  setTimeout(() => startNextRound(), 4000);
}

function showWinnerBanner(winner) {
  if (winner) {
    winnerBanner.textContent = winner === nickname ? "🎉 You won this round!" : `🏆 ${winner} got it first!`;
    winnerBanner.classList.remove("hidden");
  }
}

function setFeedback(msg, type) {
  feedbackEl.textContent  = msg;
  feedbackEl.className    = `feedback ${type}`;
  setTimeout(() => { feedbackEl.textContent = ""; feedbackEl.className = "feedback"; }, 3000);
}

// ─── Next Round ──────────────────────────────────────────────────────────────
async function startNextRound() {
  const roomRef = doc(db, "game", roomId);
  const snap    = await getDoc(roomRef);
  if (!snap.exists()) return;

  // Only first alphabetical player in room should reset (simple leader election)
  const data    = snap.data();
  const players = Object.keys(data.scores).sort();
  if (players[0] !== nickname) return; // others wait for snapshot

  const chosen = pickRandomImage();
  await setDoc(roomRef, {
    currentImage:  chosen.url,
    correctAnswer: chosen.answer,
    hint:          buildHint(chosen.answer),
    zoomLevel:     8,
    status:        "playing",
    timer:         30,
    timerStart:    serverTimestamp(),
    scores:        data.scores,
    guesses:       {},
    winner:        null,
  });
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function pickRandomImage() {
  return IMAGE_POOL[Math.floor(Math.random() * IMAGE_POOL.length)];
}

function buildHint(answer) {
  // Show first letter and underscores for the rest
  return answer[0] + " " + "_ ".repeat(answer.length - 1).trim();
}

function playSound(el) {
  try { el.currentTime = 0; el.play(); } catch (_) {}
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
