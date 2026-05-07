import { db, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp } from "./firebase.js";
import IMAGE_DATA, { CATEGORY_LABELS, getImageUrl, getFallbackUrl, shuffleArray, generateRoundQueue } from "./data.js";

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════
let nickname     = "";
let roomId       = "";
let isHost       = false;
let unsubRoom    = null;
let currentState = "";       // lobby | playing | roundEnd | finished
let lastGuess    = 0;        // anti-spam
let streak       = 0;        // consecutive correct answers
let doubleActive = false;    // power-up state
let usedPowerups = { reveal: false, freeze: false, double: false };
let freezeUntil  = 0;       // timestamp when freeze ends
let preloadedImg = null;     // preloaded next image

// ══════════════════════════════════════════════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

const screenHome  = $("screen-home");
const screenLobby = $("screen-lobby");
const screenGame  = $("screen-game");
const screenFinal = $("screen-final");
const screenError = $("screen-error");

// Home
const inputNickname = $("input-nickname");
const btnCreateRoom = $("btn-create-room");
const btnJoinRoom   = $("btn-join-room");
const joinSection   = $("join-room-section");
const inputRoomCode = $("input-room-code");
const btnEnterRoom  = $("btn-enter-room");
const homeError     = $("home-error");

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
const timerPath         = $("timer-path");
const timerText         = $("game-timer-text");
const gameImage         = $("game-image");
const imageLoading      = $("image-loading");
const roundOverlay      = $("round-overlay");
const roundOverlayText  = $("round-overlay-text");
const hintBar           = $("hint-bar");
const guessInput        = $("guess-input");
const btnGuess          = $("btn-guess");
const feedbackEl        = $("feedback");
const hostNextRound     = $("host-next-round");
const btnNextRound      = $("btn-next-round");
const leaderboardEl     = $("leaderboard");
const guessLogEl        = $("guess-log");
const winnerBanner      = $("winner-banner");
const emojiFloat        = $("emoji-float");

// Power-ups
const pwReveal = $("pw-reveal");
const pwFreeze = $("pw-freeze");
const pwDouble = $("pw-double");

// Final
const btnPlayAgain = $("btn-play-again");
const btnBackLobby = $("btn-back-lobby");

// Sound
const soundCorrect = $("sound-correct");

// ══════════════════════════════════════════════════════════════════════════════
// INIT — check URL params
// ══════════════════════════════════════════════════════════════════════════════
(function init() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  if (room) {
    inputRoomCode.value = room.toUpperCase();
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
btnBackLobby.addEventListener("click", backToLobby);
$("btn-back-home").addEventListener("click", () => switchScreen("home"));

guessInput.addEventListener("keydown", e => { if (e.key === "Enter") sendGuess(); });
inputRoomCode.addEventListener("keydown", e => { if (e.key === "Enter") joinRoom(); });
inputNickname.addEventListener("keydown", e => { if (e.key === "Enter" && !joinSection.classList.contains("hidden")) joinRoom(); });

// Power-ups
pwReveal.addEventListener("click", () => usePowerup("reveal"));
pwFreeze.addEventListener("click", () => usePowerup("freeze"));
pwDouble.addEventListener("click", () => usePowerup("double"));

// Emoji reactions
document.querySelectorAll(".emoji-btn").forEach(btn => {
  btn.addEventListener("click", () => sendEmoji(btn.dataset.emoji));
});

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
    players: { [nickname]: { score: 0, streak: 0, joinedAt: Date.now() } },
    roundQueue: [],
    round: null,
    guesses: {},
    roundWinners: [],
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
  if (!code || code.length < 4) { showHomeError("Enter a valid room code."); return; }

  nickname = inputNickname.value.trim();
  roomId = code;

  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) { switchScreen("error"); return; }

  const data = snap.data();
  isHost = (data.host === nickname);

  // Add player
  if (!data.players[nickname]) {
    await updateDoc(roomRef, { [`players.${nickname}`]: { score: 0, streak: 0, joinedAt: Date.now() } });
  }

  if (data.state === "finished") { switchScreen("error"); return; }
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
    setTimeout(() => { btnCopyLink.textContent = "📋 Copy Invite Link"; }, 2000);
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

    // Always update player list
    renderPlayerList(data.players, data.host);

    // State machine
    if (data.state === "lobby") {
      if (currentState !== "lobby") {
        currentState = "lobby";
        switchScreen("lobby");
        if (isHost) { hostControls.classList.remove("hidden"); playerWaiting.classList.add("hidden"); }
        else { hostControls.classList.add("hidden"); playerWaiting.classList.remove("hidden"); }
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
        resetPowerups();
      }
      renderGameState(data);
    }

    if (data.state === "roundEnd") {
      if (currentState !== "roundEnd") {
        currentState = "roundEnd";
        switchScreen("game");
        renderRoundEnd(data);
      }
    }

    if (data.state === "finished") {
      if (currentState !== "finished") {
        currentState = "finished";
        renderFinal(data);
        switchScreen("final");
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// HOST: START GAME
// ══════════════════════════════════════════════════════════════════════════════
async function startGame() {
  const category = selectCategory.value;
  const totalRounds = parseInt(selectRounds.value);

  // Generate shuffled round queue (Fisher-Yates in data.js)
  const roundQueue = generateRoundQueue(category, totalRounds);
  if (roundQueue.length === 0) { alert("No images available!"); return; }

  const firstKeyword = roundQueue[0];
  const roomRef = doc(db, "rooms", roomId);

  // Preload first image
  preloadImage(firstKeyword);

  await updateDoc(roomRef, {
    state: "playing",
    category,
    totalRounds: roundQueue.length, // might be less if category has fewer
    currentRound: 1,
    roundQueue,
    round: {
      answer: firstKeyword,
      imageKeyword: firstKeyword,
      startedAt: Date.now(),
      winner: null
    },
    guesses: {},
    roundWinners: []
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

  const nextNum = data.currentRound + 1;
  if (nextNum > data.totalRounds) {
    await updateDoc(roomRef, { state: "finished" });
    return;
  }

  const nextKeyword = data.roundQueue[nextNum - 1]; // 0-indexed
  if (!nextKeyword) {
    await updateDoc(roomRef, { state: "finished" });
    return;
  }

  // Preload next
  if (data.roundQueue[nextNum]) preloadImage(data.roundQueue[nextNum]);

  await updateDoc(roomRef, {
    state: "playing",
    currentRound: nextNum,
    round: {
      answer: nextKeyword,
      imageKeyword: nextKeyword,
      startedAt: Date.now(),
      winner: null
    },
    guesses: {},
    roundWinners: []
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SEND GUESS
// ══════════════════════════════════════════════════════════════════════════════
async function sendGuess() {
  if (currentState !== "playing") return;
  const now = Date.now();
  if (now - lastGuess < 2000) { setFeedback("⏳ Wait 2s between guesses.", "wrong"); return; }
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

  // Log guess
  await updateDoc(roomRef, { [`guesses.${nickname}_${now}`]: { player: nickname, guess, time: now } });

  if (guess === correct) {
    const winnersCount = (data.roundWinners || []).length;
    let points = getPoints(winnersCount);

    // Speed bonus: faster = more points (max +5 for answering in first 5 seconds)
    const elapsed = (now - data.round.startedAt) / 1000;
    const speedBonus = Math.max(0, Math.floor(5 - elapsed / 5));
    points += speedBonus;

    // Streak bonus
    const playerStreak = (data.players[nickname]?.streak || 0) + 1;
    const streakBonus = Math.min(playerStreak - 1, 3); // max +3 for streak
    points += streakBonus;

    // Double power-up
    if (doubleActive) points *= 2;

    const currentScore = data.players[nickname]?.score || 0;
    const updates = {
      [`players.${nickname}.score`]: currentScore + points,
      [`players.${nickname}.streak`]: playerStreak,
      roundWinners: [...(data.roundWinners || []), nickname]
    };

    // First winner ends round
    if (winnersCount === 0) {
      updates.state = "roundEnd";
      updates["round.winner"] = nickname;
    }

    await updateDoc(roomRef, updates);
    playSound(soundCorrect);
    streak = playerStreak;
    const bonusText = (speedBonus + streakBonus > 0) ? ` (+${speedBonus} speed, +${streakBonus} streak)` : "";
    setFeedback(`🎉 Correct! +${points} pts${bonusText}`, "correct");
  } else {
    // Reset streak on wrong guess
    await updateDoc(roomRef, { [`players.${nickname}.streak`]: 0 });
    streak = 0;
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
// POWER-UPS
// ══════════════════════════════════════════════════════════════════════════════
function usePowerup(type) {
  if (usedPowerups[type]) return;
  usedPowerups[type] = true;

  if (type === "reveal") {
    // Temporarily reduce zoom/blur for this player (local effect only)
    gameImage.style.transform = "scale(2)";
    gameImage.style.filter = "blur(2px)";
    setTimeout(() => { /* Will be overridden by next render cycle */ }, 3000);
    pwReveal.classList.add("used");
    pwReveal.disabled = true;
  }

  if (type === "freeze") {
    freezeUntil = Date.now() + 5000; // freeze for 5 seconds (local timer pauses visually)
    pwFreeze.classList.add("used");
    pwFreeze.disabled = true;
  }

  if (type === "double") {
    doubleActive = true;
    pwDouble.classList.add("used");
    pwDouble.disabled = true;
  }
}

function resetPowerups() {
  usedPowerups = { reveal: false, freeze: false, double: false };
  doubleActive = false;
  freezeUntil = 0;
  [pwReveal, pwFreeze, pwDouble].forEach(b => { b.classList.remove("used"); b.disabled = false; });
}

// ══════════════════════════════════════════════════════════════════════════════
// EMOJI REACTIONS
// ══════════════════════════════════════════════════════════════════════════════
function sendEmoji(emoji) {
  const el = document.createElement("span");
  el.className = "emoji-particle";
  el.textContent = emoji;
  el.style.left = (30 + Math.random() * 40) + "%";
  el.style.bottom = "10%";
  emojiFloat.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: GAME STATE
// ══════════════════════════════════════════════════════════════════════════════
function renderGameState(data) {
  const r = data.round;
  if (!r) return;

  // Header info
  gameRoundLabel.textContent = `Round ${data.currentRound}/${data.totalRounds}`;
  gameCategoryLabel.textContent = CATEGORY_LABELS[data.category] || data.category;

  // Image with Unsplash URL
  const imgUrl = getImageUrl(r.imageKeyword);
  if (!gameImage.src.includes(r.imageKeyword)) {
    imageLoading.classList.remove("hidden");
    gameImage.onload = () => imageLoading.classList.add("hidden");
    gameImage.onerror = () => {
      // Fallback
      gameImage.src = getFallbackUrl(r.imageKeyword);
      gameImage.onload = () => imageLoading.classList.add("hidden");
    };
    gameImage.src = imgUrl;
  }

  // Zoom/blur progression
  const elapsed = (Date.now() - r.startedAt) / 1000;
  const effectiveElapsed = (freezeUntil > Date.now()) ? Math.max(0, elapsed - 5) : elapsed;

  const step = Math.min(Math.floor(effectiveElapsed / 5), 5);
  const zoom = Math.max(1, 8 - step * 1.4);
  const blur = Math.max(0, 10 - step * 2);

  // Don't override if reveal powerup is active (within 3s)
  if (!usedPowerups.reveal || effectiveElapsed > 3) {
    gameImage.style.transform = `scale(${zoom.toFixed(1)})`;
    gameImage.style.filter = `blur(${blur.toFixed(0)}px)`;
  }

  // Timer (25 seconds)
  const ROUND_TIME = 25;
  const remaining = Math.max(0, ROUND_TIME - Math.floor(elapsed));
  timerText.textContent = remaining;
  const pct = ((ROUND_TIME - remaining) / ROUND_TIME) * 100;
  timerPath.style.strokeDashoffset = pct;
  timerPath.classList.remove("warn", "danger");
  if (remaining <= 10) timerPath.classList.add("warn");
  if (remaining <= 5) timerPath.classList.add("danger");

  // Auto-end (host only)
  if (remaining <= 0 && isHost && data.state === "playing") {
    autoEndRound();
  }

  // Hint: progressive reveal
  hintBar.textContent = buildProgressiveHint(r.answer, elapsed);

  // Leaderboard + guesses
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

  roundOverlay.classList.remove("hidden");
  const winner = r.winner;
  roundOverlayText.innerHTML = winner
    ? `✅ ${escapeHtml(r.answer.toUpperCase())}<br><small>${escapeHtml(winner)} got it first!</small>`
    : `⏰ Time's up!<br><small>Answer: <strong>${escapeHtml(r.answer)}</strong></small>`;

  // Full reveal
  gameImage.style.transform = "scale(1)";
  gameImage.style.filter = "blur(0)";

  // Winner banner
  if (winner) {
    winnerBanner.textContent = winner === nickname ? "🎉 You got it first!" : `🏆 ${escapeHtml(winner)} answered first!`;
    winnerBanner.classList.remove("hidden");
  } else {
    winnerBanner.classList.add("hidden");
  }

  // Host controls
  if (isHost) {
    hostNextRound.classList.remove("hidden");
    btnNextRound.textContent = data.currentRound >= data.totalRounds ? "🏁 Show Results" : "▶ Next Round";
  } else {
    hostNextRound.classList.add("hidden");
  }

  guessInput.disabled = true;
  gameRoundLabel.textContent = `Round ${data.currentRound}/${data.totalRounds}`;
  gameCategoryLabel.textContent = CATEGORY_LABELS[data.category] || data.category;
  timerText.textContent = "—";
  renderLeaderboard(data.players);
  renderGuessLog(data.guesses);

  // Preload next image
  if (data.roundQueue && data.roundQueue[data.currentRound]) {
    preloadImage(data.roundQueue[data.currentRound]);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: FINAL PODIUM
// ══════════════════════════════════════════════════════════════════════════════
function renderFinal(data) {
  const sorted = Object.entries(data.players)
    .map(([name, info]) => ({ name, score: info.score || 0 }))
    .sort((a, b) => b.score - a.score);

  if (sorted[0]) { $("podium-1st").textContent = sorted[0].name; $("podium-1st-score").textContent = `${sorted[0].score} pts`; }
  if (sorted[1]) { $("podium-2nd").textContent = sorted[1].name; $("podium-2nd-score").textContent = `${sorted[1].score} pts`; }
  if (sorted[2]) { $("podium-3rd").textContent = sorted[2].name; $("podium-3rd-score").textContent = `${sorted[2].score} pts`; }

  const losers = sorted.slice(3);
  $("losers-list").innerHTML = losers.length
    ? losers.map((p, i) => `<div class="loser-item">#${i + 4} ${escapeHtml(p.name)} — ${p.score} pts 🐔</div>`).join("")
    : "<p style='color:var(--muted);font-size:.85rem'>Everyone made the podium! 🎉</p>";
}

// ══════════════════════════════════════════════════════════════════════════════
// PLAY AGAIN / BACK TO LOBBY
// ══════════════════════════════════════════════════════════════════════════════
async function playAgain() {
  if (!isHost) { backToLobby(); return; }

  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();

  const players = {};
  for (const name of Object.keys(data.players)) {
    players[name] = { score: 0, streak: 0, joinedAt: data.players[name].joinedAt };
  }

  await setDoc(roomRef, {
    host: nickname,
    state: "lobby",
    category: data.category,
    totalRounds: data.totalRounds,
    currentRound: 0,
    players,
    roundQueue: [],
    round: null,
    guesses: {},
    roundWinners: [],
    createdAt: data.createdAt
  });
}

function backToLobby() {
  currentState = "";
  enterLobby();
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: PLAYER LIST
// ══════════════════════════════════════════════════════════════════════════════
function renderPlayerList(players, hostName) {
  if (!players) return;
  const names = Object.keys(players);
  playerCount.textContent = names.length;
  playerList.innerHTML = names.map(name => {
    const classes = [];
    if (name === hostName) classes.push("is-host");
    if (name === nickname) classes.push("is-me");
    return `<div class="player-item ${classes.join(" ")}">
      <span>${escapeHtml(name)}${name === nickname ? " (you)" : ""}</span>
      ${name === hostName ? '<span class="host-badge">👑 HOST</span>' : ""}
    </div>`;
  }).join("");
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: LEADERBOARD
// ══════════════════════════════════════════════════════════════════════════════
function renderLeaderboard(players) {
  if (!players) return;
  const sorted = Object.entries(players)
    .map(([name, info]) => ({ name, score: info.score || 0, streak: info.streak || 0 }))
    .sort((a, b) => b.score - a.score);

  leaderboardEl.innerHTML = sorted.map((p, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
    const me = p.name === nickname ? " me" : "";
    const streakText = p.streak >= 2 ? `<span class="streak">🔥${p.streak}</span>` : "";
    return `<div class="lb-row${me}"><span>${medal} ${escapeHtml(p.name)}${streakText}</span><span class="score">${p.score}</span></div>`;
  }).join("");
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: GUESS LOG
// ══════════════════════════════════════════════════════════════════════════════
function renderGuessLog(guesses) {
  if (!guesses) { guessLogEl.innerHTML = ""; return; }
  const entries = Object.values(guesses).sort((a, b) => b.time - a.time).slice(0, 12);
  guessLogEl.innerHTML = entries.map(g =>
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
  if (!name || name.length < 2) { showHomeError("Nickname must be at least 2 characters."); return false; }
  if (name.length > 20) { showHomeError("Nickname too long (max 20)."); return false; }
  hideHomeError();
  return true;
}

function showHomeError(msg) { homeError.textContent = msg; homeError.classList.remove("hidden"); }
function hideHomeError() { homeError.classList.add("hidden"); }

function buildProgressiveHint(answer, elapsedSec) {
  // At start: just first letter and blanks
  // After 10s: reveal category hint
  // After 15s: reveal more letters
  const chars = answer.split("");
  let revealed = chars.map((c, i) => {
    if (i === 0) return c; // always show first
    if (c === " ") return " ";
    if (elapsedSec >= 15 && i <= Math.floor(chars.length / 2)) return c; // reveal half after 15s
    if (elapsedSec >= 10 && i % 3 === 0) return c; // reveal every 3rd after 10s
    return "_";
  });
  return revealed.join(" ");
}

function preloadImage(keyword) {
  preloadedImg = new Image();
  preloadedImg.src = getImageUrl(keyword);
}

function setFeedback(msg, type) {
  feedbackEl.textContent = msg;
  feedbackEl.className = `feedback ${type}`;
  setTimeout(() => { feedbackEl.textContent = ""; feedbackEl.className = "feedback"; }, 3500);
}

function playSound(el) { try { el.currentTime = 0; el.play(); } catch (_) {} }

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ══════════════════════════════════════════════════════════════════════════════
// GAME TIMER REFRESH (every 1s for smooth countdown)
// ══════════════════════════════════════════════════════════════════════════════
setInterval(async () => {
  if (currentState !== "playing") return;
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.state === "playing") renderGameState(data);
}, 1000);
