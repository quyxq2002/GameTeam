import { db, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, arrayUnion } from "./firebase.js";
import IMAGE_DATA, { CATEGORY_LABELS, getLocalImageUrl, shuffleArray, generateRoundQueue, preloadAllRoundImages } from "./data.js";

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════
const ROUND_DURATION = 30;
const ZOOM_INTERVAL  = 3;
const ANTI_SPAM_MS   = 1500;
const EMOJI_COOLDOWN = 400; // very short — allow burst spam

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════
let nickname       = "";
let roomId         = "";
let isHost         = false;
let unsubRoom      = null;
let currentState   = "";     // lobby | loading | playing | roundEnd | finished
let lastGuess      = 0;
let lastEmoji      = 0;
let localTimerStart = 0;
let imageReady     = false;
let gameTickId     = null;   // requestAnimationFrame id
let autoEndFired   = false;  // prevent multiple auto-end calls
let processedEmojis = new Set();
let imageCache     = {};     // keyword → url (preloaded)
let audioUnlocked  = false;
let cachedRoomData = null;   // cached from onSnapshot for instant guess checks

// ══════════════════════════════════════════════════════════════════════════════
// AUDIO SYSTEM — Web Audio API + HTML5 Audio hybrid
// ══════════════════════════════════════════════════════════════════════════════
let audioCtx = null;
const audioBuffers = {};
const SOUND_FILES = {
  correct: "assets/sounds/correct.mp3",
  wrong: "assets/sounds/notcorrect.mp3",
  win: "assets/sounds/Youwin.mp3",
  gameover: "assets/sounds/gameover.mp3",
  haha: "assets/sounds/haha.mp3",
  tick: "assets/sounds/tick.mp3"
};
let tickSource = null;
let tickGain = null;
let hahaSource = null;
let hahaGain = null;

async function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    console.log("[Audio] AudioContext created, state:", audioCtx.state);

    // Load all sound buffers
    const entries = Object.entries(SOUND_FILES);
    await Promise.all(entries.map(async ([name, path]) => {
      try {
        const resp = await fetch(path);
        const buf = await resp.arrayBuffer();
        audioBuffers[name] = await audioCtx.decodeAudioData(buf);
        console.log(`[Audio] Loaded: ${name}`);
      } catch (e) {
        console.warn(`[Audio] Failed to load ${name}:`, e);
      }
    }));
    audioUnlocked = true;
    console.log("[Audio] All sounds loaded successfully");
  } catch (e) {
    console.error("[Audio] Init failed:", e);
  }
}

function playSound(name, volume = 0.6) {
  if (!audioCtx || !audioBuffers[name]) return null;
  if (audioCtx.state === "suspended") audioCtx.resume();
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  source.buffer = audioBuffers[name];
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start(0);
  return { source, gain };
}

function startTickLoop() {
  stopTickLoop();
  if (!audioCtx || !audioBuffers.tick) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  tickSource = audioCtx.createBufferSource();
  tickGain = audioCtx.createGain();
  tickSource.buffer = audioBuffers.tick;
  tickSource.loop = true;
  tickGain.gain.value = 0.15;
  tickSource.connect(tickGain);
  tickGain.connect(audioCtx.destination);
  tickSource.start(0);
  console.log("[Audio] Tick loop started");
}

function stopTickLoop() {
  if (tickSource) {
    try { tickSource.stop(); } catch (_) {}
    tickSource = null;
  }
  tickGain = null;
}

function startHahaLoop() {
  stopHahaLoop();
  if (!audioCtx || !audioBuffers.haha) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  hahaSource = audioCtx.createBufferSource();
  hahaGain = audioCtx.createGain();
  hahaSource.buffer = audioBuffers.haha;
  hahaSource.loop = true;
  hahaGain.gain.value = 0.35;
  hahaSource.connect(hahaGain);
  hahaGain.connect(audioCtx.destination);
  hahaSource.start(0);
}

function stopHahaLoop() {
  if (hahaSource) {
    try { hahaSource.stop(); } catch (_) {}
    hahaSource = null;
  }
  hahaGain = null;
}

function stopAllAudio() {
  stopTickLoop();
  stopHahaLoop();
}

// Unlock audio on first user interaction
function unlockAudio() {
  if (audioUnlocked) return;
  initAudio();
}

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

// ══════════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════════
(function init() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  if (room) {
    inputRoomCode.value = room.toUpperCase();
    joinSection.classList.remove("hidden");
  }
  // Unlock audio on first user interaction (required by browsers)
  const unlockEvents = ["click", "touchstart", "keydown"];
  const handleUnlock = () => {
    unlockAudio();
    unlockEvents.forEach(e => document.removeEventListener(e, handleUnlock));
  };
  unlockEvents.forEach(e => document.addEventListener(e, handleUnlock, { once: false }));
  console.log("[Init] Game ready, waiting for user interaction to unlock audio");
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

// Emoji buttons — allow spamming
document.querySelectorAll(".emoji-btn").forEach(btn => {
  btn.addEventListener("click", () => sendEmojiReaction(btn.dataset.emoji));
});

// ══════════════════════════════════════════════════════════════════════════════
// ROOM CREATION
// ══════════════════════════════════════════════════════════════════════════════
async function createRoom() {
  if (!validateNickname()) return;
  unlockAudio();
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

  console.log("[Room] Created:", roomId);
  enterLobby();
}

// ══════════════════════════════════════════════════════════════════════════════
// JOIN ROOM
// ══════════════════════════════════════════════════════════════════════════════
async function joinRoom() {
  if (!validateNickname()) return;
  unlockAudio();
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
  console.log("[Room] Joined:", roomId, "as", nickname, isHost ? "(HOST)" : "");
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
// REALTIME LISTENER — single onSnapshot, no polling
// ══════════════════════════════════════════════════════════════════════════════
function listenRoom() {
  if (unsubRoom) { unsubRoom(); unsubRoom = null; }
  const roomRef = doc(db, "rooms", roomId);

  unsubRoom = onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) {
      console.warn("[Listener] Room deleted");
      return;
    }
    const data = snap.data();
    handleRoomUpdate(data);
  }, (error) => {
    console.error("[Listener] onSnapshot error:", error);
  });
}

function handleRoomUpdate(data) {
  cachedRoomData = data; // cache for instant guess checks
  renderPlayerList(data.players, data.host);
  processEmojiEvents(data.emojiEvents || []);

  const state = data.state;

  // ── LOBBY ──
  if (state === "lobby") {
    if (currentState !== "lobby") {
      currentState = "lobby";
      cleanupGameState();
      switchScreen("lobby");
      if (isHost) { hostControls.classList.remove("hidden"); playerWaiting.classList.add("hidden"); }
      else { hostControls.classList.add("hidden"); playerWaiting.classList.remove("hidden"); }
    }
    return;
  }

  // ── PLAYING ──
  if (state === "playing") {
    if (currentState !== "playing" && currentState !== "loading") {
      currentState = "loading";
      autoEndFired = false;
      switchScreen("game");
      winnerBanner.classList.add("hidden");
      hostNextRound.classList.add("hidden");
      guessInput.disabled = true;
      imageReady = false;
      loadRoundImage(data);
    } else if (currentState === "playing" && imageReady) {
      // Update leaderboard/guesses in realtime without re-rendering game tick
      renderLeaderboard(data.players);
      renderGuessLog(data.guesses);
    }
    return;
  }

  // ── ROUND END ──
  if (state === "roundEnd") {
    if (currentState !== "roundEnd") {
      currentState = "roundEnd";
      stopGameTick();
      stopTickLoop();
      switchScreen("game");
      renderRoundEnd(data);
    }
    return;
  }

  // ── FINISHED ──
  if (state === "finished") {
    if (currentState !== "finished") {
      currentState = "finished";
      cleanupGameState();
      renderFinal(data);
      switchScreen("final");
    }
    return;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CLEANUP — prevent stale state & memory leaks
// ══════════════════════════════════════════════════════════════════════════════
function cleanupGameState() {
  stopGameTick();
  stopAllAudio();
  imageReady = false;
  autoEndFired = false;
  processedEmojis.clear();
  emojiFloat.innerHTML = "";
  hintBar.innerHTML = "";
}

function stopGameTick() {
  if (gameTickId) {
    cancelAnimationFrame(gameTickId);
    gameTickId = null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE LOADING — local only, instant
// ══════════════════════════════════════════════════════════════════════════════
function loadRoundImage(data) {
  const r = data.round;
  if (!r) return;

  imageLoading.classList.remove("hidden");
  gameImage.style.opacity = "0";
  gameImage.style.transform = "scale(8)";
  gameImage.style.filter = "blur(10px)";

  // Use cached URL or generate local path
  const imgUrl = imageCache[r.imageKeyword] || getLocalImageUrl(r.imageKeyword, data.category);

  const img = new Image();
  img.onload = () => {
    gameImage.src = imgUrl;
    imageLoading.classList.add("hidden");
    gameImage.style.opacity = "1";

    // Start game timer NOW
    localTimerStart = Date.now();
    imageReady = true;
    currentState = "playing";
    autoEndFired = false;
    guessInput.disabled = false;
    guessInput.value = "";
    guessInput.focus();
    feedbackEl.textContent = "";
    feedbackEl.className = "feedback";

    startTickLoop();
    startGameTick(data);
    console.log("[Round] Image loaded, timer started for:", r.imageKeyword);
  };
  img.onerror = () => {
    // Even if image fails, start the round
    console.warn("[Round] Image load failed for:", r.imageKeyword, "- starting anyway");
    gameImage.src = "";
    imageLoading.classList.add("hidden");
    localTimerStart = Date.now();
    imageReady = true;
    currentState = "playing";
    autoEndFired = false;
    guessInput.disabled = false;
    guessInput.focus();
    startTickLoop();
    startGameTick(data);
  };
  img.src = imgUrl;
}

// ══════════════════════════════════════════════════════════════════════════════
// GAME TICK — smooth 60fps via requestAnimationFrame
// ══════════════════════════════════════════════════════════════════════════════
function startGameTick(data) {
  stopGameTick();

  function tick() {
    if (currentState !== "playing" || !imageReady) return;

    const elapsed = (Date.now() - localTimerStart) / 1000;
    const remaining = Math.max(0, ROUND_DURATION - elapsed);

    // Smooth zoom + full reveal at 10s remaining
    // Progress: 0 at start → 1 at (ROUND_DURATION - 10)s
    const revealEnd = ROUND_DURATION - 10; // fully revealed with 10s left
    const progress = Math.min(1, elapsed / revealEnd);
    // Smooth easeOutCubic curve
    const eased = 1 - Math.pow(1 - progress, 3);
    const zoom = 8 - eased * 7;  // 8 → 1
    const blur = 10 - eased * 10; // 10 → 0
    gameImage.style.transform = `scale(${Math.max(1, zoom).toFixed(2)})`;
    gameImage.style.filter = `blur(${Math.max(0, blur).toFixed(1)}px)`;

    // Timer display
    const displayTime = Math.ceil(remaining);
    timerText.textContent = displayTime;
    const pct = (elapsed / ROUND_DURATION) * 100;
    timerPath.style.strokeDashoffset = Math.min(100, pct);
    timerPath.classList.toggle("warn", remaining <= 10 && remaining > 5);
    timerPath.classList.toggle("danger", remaining <= 5);

    // Tick volume ramp
    if (tickGain && remaining <= 10) {
      tickGain.gain.value = Math.min(0.5, 0.15 + (10 - remaining) * 0.035);
    }

    // Progressive hint (sets innerHTML directly)
    buildProgressiveHint(data.round.answer, elapsed);

    // Round labels
    gameRoundLabel.textContent = `Round ${data.currentRound}/${data.totalRounds}`;
    gameCategoryLabel.textContent = CATEGORY_LABELS[data.category] || data.category;

    // Auto-end (host only, fire once)
    if (remaining <= 0 && isHost && !autoEndFired) {
      autoEndFired = true;
      autoEndRound();
    }

    gameTickId = requestAnimationFrame(tick);
  }

  gameTickId = requestAnimationFrame(tick);
}

// ══════════════════════════════════════════════════════════════════════════════
// HOST: START GAME
// ══════════════════════════════════════════════════════════════════════════════
async function startGame() {
  const category = selectCategory.value;
  const totalRounds = parseInt(selectRounds.value);
  const roundQueue = generateRoundQueue(category, totalRounds);
  if (roundQueue.length === 0) { alert("No images available for this category!"); return; }

  // Preload all round images into browser cache
  console.log("[Host] Preloading", roundQueue.length, "images...");
  imageCache = await preloadAllRoundImages(roundQueue, category);
  console.log("[Host] Preload complete");

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
  console.log("[Host] Game started!");
}

// ══════════════════════════════════════════════════════════════════════════════
// HOST: NEXT ROUND
// ══════════════════════════════════════════════════════════════════════════════
async function nextRound() {
  if (!isHost) return;
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();

  const nextNum = data.currentRound + 1;
  if (nextNum > data.totalRounds || !data.roundQueue[nextNum - 1]) {
    await updateDoc(roomRef, { state: "finished" });
    console.log("[Host] Game finished!");
    return;
  }

  const nextKeyword = data.roundQueue[nextNum - 1];
  console.log("[Host] Next round:", nextNum, "keyword:", nextKeyword);

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
// AUTO END ROUND (host, timer expired)
// ══════════════════════════════════════════════════════════════════════════════
async function autoEndRound() {
  console.log("[Host] Auto-ending round (time up)");
  const roomRef = doc(db, "rooms", roomId);
  try {
    await updateDoc(roomRef, { state: "roundEnd", "round.winner": null });
  } catch (e) {
    console.error("[Host] autoEndRound error:", e);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SEND GUESS
// ══════════════════════════════════════════════════════════════════════════════
async function sendGuess() {
  if (currentState !== "playing" || !imageReady) return;
  const now = Date.now();
  if (now - lastGuess < ANTI_SPAM_MS) { setFeedback("⏳ Wait...", "wrong"); return; }
  lastGuess = now;

  const guess = guessInput.value.trim().toLowerCase();
  if (!guess) return;
  guessInput.value = "";

  // Use cached room data for INSTANT check — no await getDoc delay
  const data = cachedRoomData;
  if (!data || data.state !== "playing" || !data.round) return;

  const correct = data.round.answer.toLowerCase();
  const roomRef = doc(db, "rooms", roomId);

  if (guess === correct) {
    // Instant local feedback BEFORE Firebase write
    playSound("correct", 0.7);
    imageContainer.classList.add("correct-glow");
    setTimeout(() => imageContainer.classList.remove("correct-glow"), 2000);

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
      [`guesses.${nickname}_${now}`]: { player: nickname, guess, time: now },
      [`players.${nickname}.score`]: currentScore + points,
      [`players.${nickname}.streak`]: playerStreak,
      roundWinners: [...(data.roundWinners || []), nickname]
    };

    // First correct → end round
    if (winnersCount === 0) {
      updates.state = "roundEnd";
      updates["round.winner"] = nickname;
    }

    setFeedback(`🎉 Correct! +${points} pts (speed +${speedBonus}, streak +${streakBonus})`, "correct");
    await updateDoc(roomRef, updates);
  } else {
    // Instant local feedback BEFORE Firebase write
    playSound("wrong", 0.5);
    imageContainer.classList.add("wrong-shake");
    setTimeout(() => imageContainer.classList.remove("wrong-shake"), 500);
    setFeedback("❌ Wrong! Keep trying...", "wrong");

    // Fire-and-forget — don't await
    updateDoc(roomRef, {
      [`guesses.${nickname}_${now}`]: { player: nickname, guess, time: now },
      [`players.${nickname}.streak`]: 0
    });
  }
}

function getPoints(position) {
  if (position === 0) return 10;
  if (position === 1) return 7;
  if (position === 2) return 5;
  return 3;
}

// ══════════════════════════════════════════════════════════════════════════════
// EMOJI REACTIONS — REALTIME, LOW COOLDOWN, SYNCED
// ══════════════════════════════════════════════════════════════════════════════
async function sendEmojiReaction(emoji) {
  const now = Date.now();
  if (now - lastEmoji < EMOJI_COOLDOWN) return;
  lastEmoji = now;

  // Show locally immediately for responsiveness
  spawnEmojiParticle(emoji, nickname);

  // Push to Firebase for other players
  const roomRef = doc(db, "rooms", roomId);
  const eventId = `${nickname}_${now}`;
  processedEmojis.add(eventId); // mark as already shown locally

  try {
    await updateDoc(roomRef, {
      emojiEvents: arrayUnion({ user: nickname, emoji, ts: now })
    });
  } catch (e) {
    console.warn("[Emoji] Send failed:", e);
  }
}

function processEmojiEvents(events) {
  for (const ev of events) {
    const key = `${ev.user}_${ev.ts}`;
    if (processedEmojis.has(key)) continue;
    processedEmojis.add(key);
    spawnEmojiParticle(ev.emoji, ev.user);
  }
  // Prevent Set from growing unbounded
  if (processedEmojis.size > 200) {
    const arr = [...processedEmojis];
    processedEmojis = new Set(arr.slice(-100));
  }
}

function spawnEmojiParticle(emoji, userName) {
  const el = document.createElement("div");
  el.className = "emoji-particle";
  el.innerHTML = `<span class="emoji-icon">${emoji}</span><span class="emoji-name">${escapeHtml(userName || "")}</span>`;
  el.style.left = (10 + Math.random() * 80) + "%";
  el.style.bottom = (5 + Math.random() * 20) + "%";
  emojiFloat.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER: ROUND END
// ══════════════════════════════════════════════════════════════════════════════
function renderRoundEnd(data) {
  const r = data.round;
  if (!r) return;

  stopGameTick();
  stopTickLoop();

  // Full reveal
  gameImage.style.transform = "scale(1)";
  gameImage.style.filter = "blur(0)";

  // Glow effect
  imageContainer.classList.add("correct-glow");
  setTimeout(() => imageContainer.classList.remove("correct-glow"), 3000);

  // Winner banner
  const winner = r.winner;
  if (winner) {
    winnerBanner.textContent = winner === nickname ? "🎉 You got it first!" : `🏆 ${escapeHtml(winner)} answered first!`;
    winnerBanner.classList.remove("hidden");
    setTimeout(() => winnerBanner.classList.add("hidden"), 4000);
  } else {
    winnerBanner.textContent = "⏰ Time's up! Nobody got it.";
    winnerBanner.classList.remove("hidden");
    setTimeout(() => winnerBanner.classList.add("hidden"), 4000);
  }

  // Show answer
  hintBar.innerHTML = `<div class="hint-answer">✅ Answer: <strong>${escapeHtml(r.answer.toUpperCase())}</strong></div>`;

  // Host controls — ALWAYS visible for host
  if (isHost) {
    hostNextRound.classList.remove("hidden");
    btnNextRound.disabled = false;
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

  const totalPlayers = sorted.length;

  // Determine how many podium slots to show based on player count
  // 2 players: 1st only, rest chicken
  // 3 players: 1st + 2nd, rest chicken
  // 4+ players: 1st + 2nd + 3rd, rest chicken
  let podiumSize = 3;
  if (totalPlayers === 2) podiumSize = 1;
  else if (totalPlayers === 3) podiumSize = 2;

  // 1st place
  const slot1st = document.querySelector(".podium-slot.gold");
  const slot2nd = document.querySelector(".podium-slot.silver");
  const slot3rd = document.querySelector(".podium-slot.bronze");

  if (sorted[0]) { $("podium-1st").textContent = sorted[0].name; $("podium-1st-score").textContent = `${sorted[0].score} pts`; }
  slot1st.style.display = "flex";

  if (podiumSize >= 2 && sorted[1]) {
    $("podium-2nd").textContent = sorted[1].name;
    $("podium-2nd-score").textContent = `${sorted[1].score} pts`;
    slot2nd.style.display = "flex";
  } else {
    slot2nd.style.display = "none";
  }

  if (podiumSize >= 3 && sorted[2]) {
    $("podium-3rd").textContent = sorted[2].name;
    $("podium-3rd-score").textContent = `${sorted[2].score} pts`;
    slot3rd.style.display = "flex";
  } else {
    slot3rd.style.display = "none";
  }

  // Chicken coop: everyone NOT on podium
  const losers = sorted.slice(podiumSize);
  $("losers-list").innerHTML = losers.length
    ? losers.map((p, i) => `<div class="loser-item">#${podiumSize + i + 1} ${escapeHtml(p.name)} — ${p.score} pts 🐔</div>`).join("")
    : "<p style='color:var(--muted);font-size:.85rem'>Everyone made the podium! 🎉</p>";

  // Play audio based on rank
  const myRank = sorted.findIndex(p => p.name === nickname);
  if (myRank >= 0 && myRank < podiumSize) {
    playSound("win", 0.7);
  } else {
    playSound("gameover", 0.6);
    setTimeout(() => startHahaLoop(), 2000);
  }
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
  imageCache = {};
  processedEmojis.clear();
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
  const entries = Object.values(guesses).sort((a, b) => b.time - a.time).slice(0, 15);
  guessLogEl.innerHTML = entries.map(g =>
    `<div class="guess-entry"><span class="gname">${escapeHtml(g.player)}:</span> ${escapeHtml(g.guess)}</div>`
  ).join("");
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════════════
function switchScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = $(`screen-${name}`);
  if (el) el.classList.add("active");
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
  const words = answer.split(" ");
  const totalLetters = answer.replace(/\s/g, "").length;

  // Word count info line
  let lengthInfo;
  if (words.length === 1) {
    lengthInfo = `📝 ${totalLetters} chữ cái`;
  } else {
    lengthInfo = `📝 ${words.length} từ, ${totalLetters} chữ cái`;
  }

  // Progressive reveal — NEVER reveal full answer (always leave ~30% hidden)
  const chars = answer.split("");
  const maxReveal = Math.floor(chars.length * 0.7); // cap at 70%
  let revealedCount = 0;
  let revealed = chars.map((c, i) => {
    if (c === " ") return "  ";
    if (i === 0) { revealedCount++; return c; }
    if (revealedCount >= maxReveal) return "_";
    if (elapsedSec >= 20 && i <= Math.floor(chars.length * 0.5)) { revealedCount++; return c; }
    if (elapsedSec >= 12 && i % 3 === 0) { revealedCount++; return c; }
    return "_";
  });

  // Render as HTML: letter count on top, hint below
  hintBar.innerHTML = `<div class="hint-length">${lengthInfo}</div><div class="hint-letters">${revealed.join(" ")}</div>`;
  return null; // signal that we've set innerHTML directly
}

function setFeedback(msg, type) {
  feedbackEl.textContent = msg;
  feedbackEl.className = `feedback ${type}`;
  setTimeout(() => { feedbackEl.textContent = ""; feedbackEl.className = "feedback"; }, 3500);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
