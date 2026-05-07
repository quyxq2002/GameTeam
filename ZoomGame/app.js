import { db, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp } from "./firebase.js";
import IMAGE_DATA, { CATEGORY_LABELS, getImageUrl, preloadImageWithFallback, shuffleArray, generateRoundQueue } from "./data.js";

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════
const ROUND_DURATION = 30;  // seconds
const ZOOM_INTERVAL  = 3;   // seconds between zoom steps
const ANTI_SPAM_MS   = 2000;
const EMOJI_COOLDOWN = 1500;

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════
let nickname     = "";
let roomId       = "";
let isHost       = false;
let unsubRoom    = null;
let currentState = "";       // lobby | loading | playing | roundEnd | finished
let lastGuess    = 0;
let lastEmoji    = 0;
let localTimerStart = 0;     // set AFTER image loads
let imageReady   = false;
let tickPlaying  = false;
let tickInterval = null;
let processedEmojis = new Set(); // track seen emoji events

// ══════════════════════════════════════════════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

const screenHome  = $("screen-home");
const screenLobby = $("screen-lobby");
const screenGame  = $("screen-game");
const screenFinal = $("screen-final");
const screenError = $("screen-error");

const inputNickname = $("input-nickname");
const btnCreateRoom = $("btn-create-room");
const btnJoinRoom   = $("btn-join-room");
const joinSection   = $("join-room-section");
const inputRoomCode = $("input-room-code");
const btnEnterRoom  = $("btn-enter-room");
const homeError     = $("home-error");

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

const gameRoundLabel    = $("game-round-label");
const gameCategoryLabel = $("game-category-label");
const timerPath         = $("timer-path");
const timerText         = $("game-timer-text");
const gameImage         = $("game-image");
const imageLoading      = $("image-loading");
const imageContainer    = $("image-container");
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

const btnPlayAgain = $("btn-play-again");
const btnBackLobby = $("btn-back-lobby");

// Audio
const soundCorrect  = $("sound-correct");
const soundWrong    = $("sound-wrong");
const soundWin      = $("sound-win");
const soundGameover = $("sound-gameover");
const soundHaha     = $("sound-haha");
const soundTick     = $("sound-tick");

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
  // Preload all audio
  [soundCorrect, soundWrong, soundWin, soundGameover, soundHaha, soundTick].forEach(a => { a.load(); });
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

// Emoji buttons — send to Firebase for realtime sync
document.querySelectorAll(".emoji-btn").forEach(btn => {
  btn.addEventListener("click", () => sendEmojiReaction(btn.dataset.emoji));
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
    emojiEvents: [],
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

    renderPlayerList(data.players, data.host);

    // Process realtime emoji events
    processEmojiEvents(data.emojiEvents || []);

    // State machine
    if (data.state === "lobby") {
      if (currentState !== "lobby") {
        currentState = "lobby";
        switchScreen("lobby");
        stopTickSound();
        if (isHost) { hostControls.classList.remove("hidden"); playerWaiting.classList.add("hidden"); }
        else { hostControls.classList.add("hidden"); playerWaiting.classList.remove("hidden"); }
      }
    }

    if (data.state === "playing") {
      if (currentState !== "playing" && currentState !== "loading") {
        currentState = "loading";
        switchScreen("game");
        winnerBanner.classList.add("hidden");
        hostNextRound.classList.add("hidden");
        guessInput.disabled = true;
        imageReady = false;
        loadRoundImage(data);
      }
      if (currentState === "playing" && imageReady) {
        renderGameState(data);
      }
    }

    if (data.state === "roundEnd") {
      if (currentState !== "roundEnd") {
        currentState = "roundEnd";
        switchScreen("game");
        stopTickSound();
        renderRoundEnd(data);
      }
    }

    if (data.state === "finished") {
      if (currentState !== "finished") {
        currentState = "finished";
        stopTickSound();
        renderFinal(data);
        switchScreen("final");
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE PRELOAD — TIMER ONLY STARTS AFTER IMAGE LOADS
// ══════════════════════════════════════════════════════════════════════════════
async function loadRoundImage(data) {
  const r = data.round;
  if (!r) return;

  imageLoading.classList.remove("hidden");
  gameImage.style.opacity = "0";

  // Preload with fallback chain
  const resolvedUrl = await preloadImageWithFallback(r.imageKeyword, data.category, 8000);

  // Set image
  gameImage.src = resolvedUrl;
  gameImage.onload = () => {
    imageLoading.classList.add("hidden");
    gameImage.style.opacity = "1";
    gameImage.classList.add("fade-in");
    setTimeout(() => gameImage.classList.remove("fade-in"), 600);

    // NOW start timer locally
    localTimerStart = Date.now();
    imageReady = true;
    currentState = "playing";
    guessInput.disabled = false;
    guessInput.focus();
    startTickSound();
    renderGameState(data);
  };
  gameImage.onerror = () => {
    // Last resort: empty image, still start game
    imageLoading.classList.add("hidden");
    localTimerStart = Date.now();
    imageReady = true;
    currentState = "playing";
    guessInput.disabled = false;
    startTickSound();
  };

  // Also preload next image
  if (data.roundQueue && data.roundQueue[data.currentRound]) {
    preloadImageWithFallback(data.roundQueue[data.currentRound], data.category, 10000);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HOST: START GAME
// ══════════════════════════════════════════════════════════════════════════════
async function startGame() {
  const category = selectCategory.value;
  const totalRounds = parseInt(selectRounds.value);
  const roundQueue = generateRoundQueue(category, totalRounds);
  if (roundQueue.length === 0) { alert("No images available!"); return; }

  const firstKeyword = roundQueue[0];
  const roomRef = doc(db, "rooms", roomId);

  await updateDoc(roomRef, {
    state: "playing",
    category,
    totalRounds: roundQueue.length,
    currentRound: 1,
    roundQueue,
    round: {
      answer: firstKeyword,
      imageKeyword: firstKeyword,
      startedAt: Date.now(),
      winner: null
    },
    guesses: {},
    roundWinners: [],
    emojiEvents: []
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
  if (nextNum > data.totalRounds || !data.roundQueue[nextNum - 1]) {
    await updateDoc(roomRef, { state: "finished" });
    return;
  }

  const nextKeyword = data.roundQueue[nextNum - 1];

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
    roundWinners: [],
    emojiEvents: []
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SEND GUESS
// ══════════════════════════════════════════════════════════════════════════════
async function sendGuess() {
  if (currentState !== "playing" || !imageReady) return;
  const now = Date.now();
  if (now - lastGuess < ANTI_SPAM_MS) { setFeedback("⏳ Wait 2s...", "wrong"); return; }
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

    // Speed bonus
    const elapsed = (now - localTimerStart) / 1000;
    const speedBonus = Math.max(0, Math.floor((ROUND_DURATION - elapsed) / 6));
    points += speedBonus;

    // Streak bonus
    const playerStreak = (data.players[nickname]?.streak || 0) + 1;
    const streakBonus = Math.min(playerStreak - 1, 3);
    points += streakBonus;

    const currentScore = data.players[nickname]?.score || 0;
    const updates = {
      [`players.${nickname}.score`]: currentScore + points,
      [`players.${nickname}.streak`]: playerStreak,
      roundWinners: [...(data.roundWinners || []), nickname]
    };

    if (winnersCount === 0) {
      updates.state = "roundEnd";
      updates["round.winner"] = nickname;
    }

    await updateDoc(roomRef, updates);
    playAudio(soundCorrect);
    imageContainer.classList.add("correct-glow");
    setTimeout(() => imageContainer.classList.remove("correct-glow"), 2000);
    setFeedback(`🎉 Correct! +${points} pts (speed +${speedBonus}, streak +${streakBonus})`, "correct");
  } else {
    await updateDoc(roomRef, { [`players.${nickname}.streak`]: 0 });
    playAudio(soundWrong);
    imageContainer.classList.add("wrong-shake");
    setTimeout(() => imageContainer.classList.remove("wrong-shake"), 500);
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
// EMOJI REACTIONS — REALTIME SYNC VIA FIREBASE
// ══════════════════════════════════════════════════════════════════════════════
async function sendEmojiReaction(emoji) {
  const now = Date.now();
  if (now - lastEmoji < EMOJI_COOLDOWN) return; // spam protection
  lastEmoji = now;

  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();

  const events = data.emojiEvents || [];
  // Keep only last 20 events to prevent Firebase bloat
  const trimmed = events.slice(-19);
  trimmed.push({ user: nickname, emoji, ts: now });

  await updateDoc(roomRef, { emojiEvents: trimmed });
}

function processEmojiEvents(events) {
  for (const ev of events) {
    const key = `${ev.user}_${ev.ts}`;
    if (processedEmojis.has(key)) continue;
    processedEmojis.add(key);
    // Show floating emoji for ALL players
    spawnEmojiParticle(ev.emoji);
  }
  // Clean up old keys
  if (processedEmojis.size > 100) {
    const arr = [...processedEmojis];
    processedEmojis = new Set(arr.slice(-50));
  }
}

function spawnEmojiParticle(emoji) {
  const el = document.createElement("span");
  el.className = "emoji-particle";
  el.textContent = emoji;
  el.style.left = (20 + Math.random() * 60) + "%";
  el.style.bottom = (5 + Math.random() * 15) + "%";
  emojiFloat.appendChild(el);
  setTimeout(() => el.remove(), 2300);
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIO SYSTEM
// ══════════════════════════════════════════════════════════════════════════════
function playAudio(el) {
  try { el.currentTime = 0; el.volume = 0.6; el.play(); } catch (_) {}
}

function startTickSound() {
  if (tickPlaying) return;
  tickPlaying = true;
  soundTick.loop = true;
  soundTick.volume = 0.2;
  try { soundTick.play(); } catch (_) {}
}

function stopTickSound() {
  tickPlaying = false;
  soundTick.pause();
  soundTick.currentTime = 0;
}

function playFinalAudio(isWinner) {
  if (isWinner) {
    playAudio(soundWin);
  } else {
    playAudio(soundGameover);
    setTimeout(() => {
      soundHaha.loop = true;
      soundHaha.volume = 0.4;
      try { soundHaha.play(); } catch (_) {}
    }, 2000);
  }
}

function stopAllAudio() {
  soundHaha.pause(); soundHaha.currentTime = 0; soundHaha.loop = false;
  stopTickSound();
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: GAME STATE (called every 1s tick)
// ══════════════════════════════════════════════════════════════════════════════
function renderGameState(data) {
  const r = data.round;
  if (!r || !imageReady) return;

  gameRoundLabel.textContent = `Round ${data.currentRound}/${data.totalRounds}`;
  gameCategoryLabel.textContent = CATEGORY_LABELS[data.category] || data.category;

  // Zoom/blur based on LOCAL timer (fair - starts after image loads)
  const elapsed = (Date.now() - localTimerStart) / 1000;
  const step = Math.min(Math.floor(elapsed / ZOOM_INTERVAL), 10);
  const zoom = Math.max(1, 8 - step * 0.7);
  const blur = Math.max(0, 10 - step * 1);

  gameImage.style.transform = `scale(${zoom.toFixed(1)})`;
  gameImage.style.filter = `blur(${blur.toFixed(0)}px)`;

  // Timer
  const remaining = Math.max(0, ROUND_DURATION - Math.floor(elapsed));
  timerText.textContent = remaining;
  const pct = ((ROUND_DURATION - remaining) / ROUND_DURATION) * 100;
  timerPath.style.strokeDashoffset = pct;
  timerPath.classList.remove("warn", "danger");
  if (remaining <= 10) timerPath.classList.add("warn");
  if (remaining <= 5) timerPath.classList.add("danger");

  // Tick volume increase at final countdown
  if (remaining <= 10 && tickPlaying) {
    soundTick.volume = Math.min(0.6, 0.2 + (10 - remaining) * 0.04);
  }

  // Auto-end (host only)
  if (remaining <= 0 && isHost && data.state === "playing") {
    autoEndRound();
  }

  // Progressive hint
  hintBar.textContent = buildProgressiveHint(r.answer, elapsed);

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
// RENDER: ROUND END — NO dark overlay, uses popup + glow
// ══════════════════════════════════════════════════════════════════════════════
function renderRoundEnd(data) {
  const r = data.round;
  if (!r) return;

  stopTickSound();

  // Full reveal — keep image bright, no overlay
  gameImage.style.transform = "scale(1)";
  gameImage.style.filter = "blur(0)";

  // Glow effect on container
  imageContainer.classList.add("correct-glow");
  setTimeout(() => imageContainer.classList.remove("correct-glow"), 3000);

  // Winner banner (not overlay)
  const winner = r.winner;
  if (winner) {
    winnerBanner.textContent = winner === nickname ? "🎉 You got it first!" : `🏆 ${escapeHtml(winner)} answered first!`;
    winnerBanner.classList.remove("hidden");
    setTimeout(() => winnerBanner.classList.add("hidden"), 4000);
  }

  // Show answer as hint bar (NOT as dark overlay)
  hintBar.textContent = `✅ Answer: ${r.answer.toUpperCase()}`;

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
  timerText.textContent = "✓";
  timerPath.style.strokeDashoffset = 100;
  renderLeaderboard(data.players);
  renderGuessLog(data.guesses);
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: FINAL PODIUM
// ══════════════════════════════════════════════════════════════════════════════
function renderFinal(data) {
  stopAllAudio();

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

  // Play appropriate audio
  const myRank = sorted.findIndex(p => p.name === nickname);
  playFinalAudio(myRank >= 0 && myRank < 3);
}

// ══════════════════════════════════════════════════════════════════════════════
// PLAY AGAIN / BACK TO LOBBY
// ══════════════════════════════════════════════════════════════════════════════
async function playAgain() {
  stopAllAudio();
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
    emojiEvents: [],
    createdAt: data.createdAt
  });
}

function backToLobby() {
  stopAllAudio();
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
  const chars = answer.split("");
  let revealed = chars.map((c, i) => {
    if (i === 0) return c;
    if (c === " ") return " ";
    if (elapsedSec >= 20 && i <= Math.floor(chars.length * 0.6)) return c;
    if (elapsedSec >= 12 && i % 3 === 0) return c;
    return "_";
  });
  return revealed.join(" ");
}

function setFeedback(msg, type) {
  feedbackEl.textContent = msg;
  feedbackEl.className = `feedback ${type}`;
  setTimeout(() => { feedbackEl.textContent = ""; feedbackEl.className = "feedback"; }, 3500);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ══════════════════════════════════════════════════════════════════════════════
// GAME TIMER REFRESH — 1s interval for smooth countdown
// ══════════════════════════════════════════════════════════════════════════════
setInterval(async () => {
  if (currentState !== "playing" || !imageReady) return;
  // Re-fetch to get latest state (handles other players winning)
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.state === "playing") {
    renderGameState(data);
  }
}, 1000);
