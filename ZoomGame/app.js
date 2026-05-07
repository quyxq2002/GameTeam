import { db, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, deleteField } from "./firebase.js";
import IMAGE_DATA from "./data.js";

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════
let nickname   = "";
let roomId     = "";
let isHost     = false;
let unsubRoom  = null;
let timerRef   = null;
let lastGuess  = 0;        // anti-spam timestamp
let currentState = "";     // lobby | playing | roundEnd | finished

// ══════════════════════════════════════════════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

// Screens
const screenHome  = $("screen-home");
const screenLobby = $("screen-lobby");
const screenGame  = $("screen-game");
const screenFinal = $("screen-final");
const screenError = $("screen-error");

// Home
const inputNickname  = $("input-nickname");
const btnCreateRoom  = $("btn-create-room");
const btnJoinRoom    = $("btn-join-room");
const joinSection    = $("join-room-section");
const inputRoomCode  = $("input-room-code");
const btnEnterRoom   = $("btn-enter-room");
const homeError      = $("home-error");

// Lobby
const lobbyRoomCode  = $("lobby-room-code");
const lobbyShareLink = $("lobby-share-link");
const btnCopyLink    = $("btn-copy-link");
const hostControls   = $("host-controls");
const playerWaiting  = $("player-waiting");
const selectCategory = $("select-category");
const selectRounds   = $("select-rounds");
const btnStartGame   = $("btn-start-game");
const playerCount    = $("player-count");
const playerList     = $("player-list");

// Game
const gameRoundLabel    = $("game-round-label");
const gameCategoryLabel = $("game-category-label");
const gameTimer         = $("game-timer");
const gameImage         = $("game-image");
const roundOverlay      = $("round-overlay");
const roundOverlayText  = $("round-overlay-text");
const hintBar           = $("hint-bar");
const guessInput        = $("guess-input");
const btnGuess          = $("btn-guess");
const feedback          = $("feedback");
const hostNextRound     = $("host-next-round");
const btnNextRound      = $("btn-next-round");
const leaderboard       = $("leaderboard");
const guessLog          = $("guess-log");
const winnerBanner      = $("winner-banner");

// Final
const btnPlayAgain = $("btn-play-again");

// Sounds
const soundCorrect = $("sound-correct");

// ══════════════════════════════════════════════════════════════════════════════
// INIT — check URL for ?room=XXXX
// ══════════════════════════════════════════════════════════════════════════════
(function init() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get("room");
  if (roomParam) {
    inputRoomCode.value = roomParam.toUpperCase();
    joinSection.classList.remove("hidden");
  }
})();

// ══════════════════════════════════════════════════════════════════════════════
// EVENT BINDINGS
// ══════════════════════════════════════════════════════════════════════════════
btnCreateRoom.addEventListener("click", createRoom);
btnJoinRoom.addEventListener("click", () => joinSection.classList.toggle("hidden"));
btnEnterRoom.addEventListener("click", joinRoom);
btnCopyLink.addEventListener("click", copyShareLink);
btnStartGame.addEventListener("click", startGame);
btnGuess.addEventListener("click", sendGuess);
btnNextRound.addEventListener("click", nextRound);
btnPlayAgain.addEventListener("click", playAgain);
$("btn-back-home").addEventListener("click", () => switchScreen("home"));

guessInput.addEventListener("keydown", e => { if (e.key === "Enter") sendGuess(); });
inputRoomCode.addEventListener("keydown", e => { if (e.key === "Enter") joinRoom(); });
inputNickname.addEventListener("keydown", e => { if (e.key === "Enter") { if(!joinSection.classList.contains("hidden")) joinRoom(); } });

// ══════════════════════════════════════════════════════════════════════════════
// ROOM CREATION
// ══════════════════════════════════════════════════════════════════════════════
async function createRoom() {
  if (!validateNickname()) return;
  nickname = inputNickname.value.trim();
  roomId = generateRoomCode();
  isHost = true;

  const roomRef = doc(db, "rooms", roomId);
  await setDoc(roomRef, {
    host: nickname,
    state: "lobby",
    category: "animals",
    totalRounds: 10,
    currentRound: 0,
    players: { [nickname]: { score: 0, joinedAt: Date.now() } },
    round: null,
    guesses: {},
    roundWinners: [],
    usedImages: [],
    createdAt: serverTimestamp()
  });

  enterLobby();
}

// ══════════════════════════════════════════════════════════════════════════════
// JOIN ROOM
// ══════════════════════════════════════════════════════════════════════════════
async function joinRoom() {
  if (!validateNickname()) return;
  const code = inputRoomCode.value.trim().toUpperCase();
  if (!code || code.length < 4) { showHomeError("Please enter a valid room code."); return; }

  nickname = inputNickname.value.trim();
  roomId = code;

  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) { switchScreen("error"); return; }

  const data = snap.data();
  isHost = (data.host === nickname);

  // Add player if not exists
  if (!data.players[nickname]) {
    await updateDoc(roomRef, { [`players.${nickname}`]: { score: 0, joinedAt: Date.now() } });
  }

  // If game already running, go to game screen
  if (data.state === "playing" || data.state === "roundEnd") {
    enterLobby();
    return;
  }
  if (data.state === "finished") {
    switchScreen("error");
    return;
  }

  enterLobby();
}

// ══════════════════════════════════════════════════════════════════════════════
// LOBBY
// ══════════════════════════════════════════════════════════════════════════════
function enterLobby() {
  switchScreen("lobby");
  lobbyRoomCode.textContent = roomId;
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
  lobbyShareLink.textContent = shareUrl;

  if (isHost) {
    hostControls.classList.remove("hidden");
    playerWaiting.classList.add("hidden");
  } else {
    hostControls.classList.add("hidden");
    playerWaiting.classList.remove("hidden");
  }

  listenRoom();
}

function copyShareLink() {
  const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
  navigator.clipboard.writeText(url).then(() => {
    btnCopyLink.textContent = "✓ Copied!";
    setTimeout(() => { btnCopyLink.textContent = "📋 Copy Link"; }, 2000);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// REALTIME LISTENER
// ══════════════════════════════════════════════════════════════════════════════
function listenRoom() {
  if (unsubRoom) unsubRoom();
  const roomRef = doc(db, "rooms", roomId);

  unsubRoom = onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();

    // Update player list (always)
    renderPlayerList(data.players);

    // State transitions
    if (data.state === "lobby" && currentState !== "lobby") {
      currentState = "lobby";
      if (screenGame.classList.contains("active") || screenFinal.classList.contains("active")) {
        switchScreen("lobby");
        enterLobby();
      }
    }

    if (data.state === "playing") {
      if (currentState !== "playing") {
        currentState = "playing";
        switchScreen("game");
        winnerBanner.classList.add("hidden");
        roundOverlay.classList.add("hidden");
        hostNextRound.classList.add("hidden");
        guessInput.disabled = false;
      }
      renderGameState(data);
    }

    if (data.state === "roundEnd") {
      currentState = "roundEnd";
      switchScreen("game");
      renderRoundEnd(data);
    }

    if (data.state === "finished") {
      currentState = "finished";
      renderFinal(data);
      switchScreen("final");
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// HOST: START GAME
// ══════════════════════════════════════════════════════════════════════════════
async function startGame() {
  const category = selectCategory.value;
  const totalRounds = parseInt(selectRounds.value);
  const roomRef = doc(db, "rooms", roomId);

  // Pick first image
  const image = pickImage(category, []);
  if (!image) { alert("No images available for this category!"); return; }

  await updateDoc(roomRef, {
    state: "playing",
    category,
    totalRounds,
    currentRound: 1,
    round: {
      image: image.image,
      answer: image.answer,
      startedAt: Date.now(),
      zoomStep: 0
    },
    guesses: {},
    roundWinners: [],
    usedImages: [image.answer]
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// HOST: NEXT ROUND
// ══════════════════════════════════════════════════════════════════════════════
async function nextRound() {
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();

  const nextRoundNum = data.currentRound + 1;

  if (nextRoundNum > data.totalRounds) {
    // Game over
    await updateDoc(roomRef, { state: "finished" });
    return;
  }

  const image = pickImage(data.category, data.usedImages || []);
  if (!image) {
    await updateDoc(roomRef, { state: "finished" });
    return;
  }

  await updateDoc(roomRef, {
    state: "playing",
    currentRound: nextRoundNum,
    round: {
      image: image.image,
      answer: image.answer,
      startedAt: Date.now(),
      zoomStep: 0
    },
    guesses: {},
    roundWinners: [],
    usedImages: [...(data.usedImages || []), image.answer]
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SEND GUESS
// ══════════════════════════════════════════════════════════════════════════════
async function sendGuess() {
  if (currentState !== "playing") return;
  const now = Date.now();
  if (now - lastGuess < 2000) { setFeedback("⏳ Wait 2 seconds...", "wrong"); return; }
  lastGuess = now;

  const guess = guessInput.value.trim().toLowerCase();
  if (!guess) return;
  guessInput.value = "";

  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.state !== "playing") return;

  const correct = data.round.answer.toLowerCase();

  // Store guess in log
  const guessKey = `guesses.${nickname}_${Date.now()}`;
  await updateDoc(roomRef, { [guessKey]: { player: nickname, guess, time: Date.now() } });

  if (guess === correct) {
    // Calculate points based on position
    const winnersCount = (data.roundWinners || []).length;
    const points = getPoints(winnersCount);
    const currentScore = data.players[nickname]?.score || 0;

    const updates = {
      [`players.${nickname}.score`]: currentScore + points,
      roundWinners: [...(data.roundWinners || []), nickname]
    };

    // If first winner → end the round
    if (winnersCount === 0) {
      updates.state = "roundEnd";
      updates["round.winner"] = nickname;
    }

    await updateDoc(roomRef, updates);
    playSound(soundCorrect);
    setFeedback(`🎉 Correct! +${points} points!`, "correct");
  } else {
    setFeedback("❌ Wrong! Keep trying...", "wrong");
  }
}

function getPoints(position) {
  if (position === 0) return 10;
  if (position === 1) return 7;
  if (position === 2) return 5;
  return 3;
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: GAME STATE
// ══════════════════════════════════════════════════════════════════════════════
function renderGameState(data) {
  const r = data.round;
  if (!r) return;

  // Header
  gameRoundLabel.textContent = `Round ${data.currentRound}/${data.totalRounds}`;
  gameCategoryLabel.textContent = getCategoryLabel(data.category);

  // Image zoom/blur progression
  const elapsed = (Date.now() - r.startedAt) / 1000;
  const step = Math.min(Math.floor(elapsed / 5), 5); // 0-5 steps
  const zoom = Math.max(1, 8 - step * 1.4);
  const blur = Math.max(0, 10 - step * 2);

  if (gameImage.src !== r.image) gameImage.src = r.image;
  gameImage.style.transform = `scale(${zoom.toFixed(1)})`;
  gameImage.style.filter = `blur(${blur.toFixed(0)}px)`;

  // Timer (25 seconds per round)
  const remaining = Math.max(0, 25 - Math.floor(elapsed));
  gameTimer.textContent = `⏱ ${remaining}s`;
  gameTimer.className = "timer";
  if (remaining <= 10) gameTimer.classList.add("warn");
  if (remaining <= 5) { gameTimer.classList.remove("warn"); gameTimer.classList.add("danger"); }

  // Auto-end at 0 (host only)
  if (remaining <= 0 && isHost && data.state === "playing") {
    autoEndRound();
  }

  // Hint
  hintBar.textContent = `Hint: ${buildHint(r.answer)}`;

  // Leaderboard
  renderLeaderboard(data.players);
  renderGuessLog(data.guesses);
}

async function autoEndRound() {
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists() || snap.data().state !== "playing") return;
  await updateDoc(roomRef, { state: "roundEnd", "round.winner": null });
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: ROUND END
// ══════════════════════════════════════════════════════════════════════════════
function renderRoundEnd(data) {
  const r = data.round;
  if (!r) return;

  // Show answer
  roundOverlay.classList.remove("hidden");
  const winner = r.winner;
  roundOverlayText.innerHTML = winner
    ? `✅ ${escapeHtml(r.answer)}<br><small>${escapeHtml(winner)} got it first!</small>`
    : `⏰ Time's up!<br>Answer: ${escapeHtml(r.answer)}`;

  // Image full reveal
  gameImage.style.transform = "scale(1)";
  gameImage.style.filter = "blur(0)";
  if (gameImage.src !== r.image) gameImage.src = r.image;

  // Winner banner
  if (winner) {
    winnerBanner.textContent = winner === nickname ? "🎉 You got it!" : `🏆 ${winner} answered first!`;
    winnerBanner.classList.remove("hidden");
  }

  // Host next round button
  if (isHost) {
    hostNextRound.classList.remove("hidden");
    btnNextRound.textContent = data.currentRound >= data.totalRounds ? "🏁 Show Results" : "▶ Next Round";
  }

  guessInput.disabled = true;
  renderLeaderboard(data.players);
  renderGuessLog(data.guesses);

  // Header
  gameRoundLabel.textContent = `Round ${data.currentRound}/${data.totalRounds}`;
  gameCategoryLabel.textContent = getCategoryLabel(data.category);
  gameTimer.textContent = "⏱ —";
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: FINAL PODIUM
// ══════════════════════════════════════════════════════════════════════════════
function renderFinal(data) {
  const sorted = Object.entries(data.players)
    .map(([name, info]) => ({ name, score: info.score }))
    .sort((a, b) => b.score - a.score);

  // Podium
  if (sorted[0]) { $("podium-1st").textContent = sorted[0].name; $("podium-1st-score").textContent = `${sorted[0].score} pts`; }
  if (sorted[1]) { $("podium-2nd").textContent = sorted[1].name; $("podium-2nd-score").textContent = `${sorted[1].score} pts`; }
  if (sorted[2]) { $("podium-3rd").textContent = sorted[2].name; $("podium-3rd-score").textContent = `${sorted[2].score} pts`; }

  // Losers
  const losers = sorted.slice(3);
  $("losers-list").innerHTML = losers.length
    ? losers.map((p, i) => `<div class="loser-item">#${i+4} ${escapeHtml(p.name)} — ${p.score} pts 🐔</div>`).join("")
    : "<p style='color:var(--muted)'>No chicken coop members this time!</p>";
}

// ══════════════════════════════════════════════════════════════════════════════
// PLAY AGAIN
// ══════════════════════════════════════════════════════════════════════════════
async function playAgain() {
  if (!isHost) {
    // Players go back to lobby state check
    switchScreen("lobby");
    enterLobby();
    return;
  }

  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();

  // Reset scores
  const players = {};
  for (const name of Object.keys(data.players)) {
    players[name] = { score: 0, joinedAt: data.players[name].joinedAt };
  }

  await setDoc(roomRef, {
    host: nickname,
    state: "lobby",
    category: data.category,
    totalRounds: data.totalRounds,
    currentRound: 0,
    players,
    round: null,
    guesses: {},
    roundWinners: [],
    usedImages: [],
    createdAt: data.createdAt
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: PLAYER LIST (LOBBY)
// ══════════════════════════════════════════════════════════════════════════════
function renderPlayerList(players) {
  if (!players) return;
  const names = Object.keys(players);
  playerCount.textContent = names.length;
  playerList.innerHTML = names.map(name => {
    const badge = name === nickname ? " (you)" : "";
    const hostBadge = (name === roomId) ? "" : ""; // We'll check via snapshot
    return `<div class="player-item">
      <span>${escapeHtml(name)}${badge}</span>
      ${name === getHostFromUI() ? '<span class="host-badge">HOST</span>' : ""}
    </div>`;
  }).join("");
}

function getHostFromUI() {
  // Simple: host = first who created room. We track via isHost flag.
  // In the snapshot data, data.host stores this.
  return ""; // We'll use snapshot data directly
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: LEADERBOARD
// ══════════════════════════════════════════════════════════════════════════════
function renderLeaderboard(players) {
  if (!players) return;
  const sorted = Object.entries(players)
    .map(([name, info]) => ({ name, score: info.score }))
    .sort((a, b) => b.score - a.score);

  leaderboard.innerHTML = sorted.map((p, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`;
    const me = p.name === nickname ? " me" : "";
    return `<div class="lb-row${me}"><span>${medal} ${escapeHtml(p.name)}</span><span class="score">${p.score}</span></div>`;
  }).join("");
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: GUESS LOG
// ══════════════════════════════════════════════════════════════════════════════
function renderGuessLog(guesses) {
  if (!guesses) { guessLog.innerHTML = ""; return; }
  const entries = Object.values(guesses)
    .sort((a, b) => b.time - a.time)
    .slice(0, 10);
  guessLog.innerHTML = entries.map(g =>
    `<div class="guess-entry"><span class="gname">${escapeHtml(g.player)}:</span> ${escapeHtml(g.guess)}</div>`
  ).join("");
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════════════
function switchScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(`screen-${name}`).classList.add("active");
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function validateNickname() {
  const name = inputNickname.value.trim();
  if (!name) { showHomeError("Enter a nickname first!"); return false; }
  if (name.length < 2) { showHomeError("Nickname must be at least 2 characters."); return false; }
  hideHomeError();
  return true;
}

function showHomeError(msg) { homeError.textContent = msg; homeError.classList.remove("hidden"); }
function hideHomeError() { homeError.classList.add("hidden"); }

function pickImage(category, usedImages) {
  const pool = IMAGE_DATA[category];
  if (!pool) return null;
  const available = pool.filter(img => !usedImages.includes(img.answer));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function buildHint(answer) {
  if (answer.length <= 1) return "_ ";
  return answer[0] + " " + "_ ".repeat(answer.length - 1).trim();
}

function getCategoryLabel(cat) {
  const map = { animals: "🐶 Animals", fruits: "🍎 Fruits", cars: "🚗 Cars", phones: "📱 Phones", logos: "🏢 Logos", food: "🍔 Food", tech: "🧠 Tech", objects: "🏠 Objects" };
  return map[cat] || cat;
}

function setFeedback(msg, type) {
  feedback.textContent = msg;
  feedback.className = `feedback ${type}`;
  setTimeout(() => { feedback.textContent = ""; feedback.className = "feedback"; }, 3000);
}

function playSound(el) { try { el.currentTime = 0; el.play(); } catch (_) {} }

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ══════════════════════════════════════════════════════════════════════════════
// GAME TIMER LOOP (visual refresh every 1s)
// ══════════════════════════════════════════════════════════════════════════════
setInterval(async () => {
  if (currentState !== "playing") return;
  // Re-render from cached snapshot isn't ideal; let's trigger via snapshot.
  // The onSnapshot already fires on every change.
  // But for smooth timer countdown, we read from round.startedAt locally:
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.state === "playing") renderGameState(data);
}, 1000);
