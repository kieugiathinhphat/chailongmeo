const $ = (id) => document.getElementById(id);

const startScreen = $("startScreen");
const gameScreen = $("gameScreen");
const playBtn = $("playBtn");
const restartBtn = $("restartBtn");
const soundBtn = $("soundBtn");
const scoreEl = $("score");
const bestScoreEl = $("bestScore");
const hintEl = $("hint");
const stage = $("stage");
const brushZone = $("brushZone");
const comb = $("comb");
const darkOverlay = $("darkOverlay");
const deathText = $("deathText");

const catNormal = $("catNormal");
const catBody = $("catBody");
const catHeadStare = $("catHeadStare");
const catHeadLose = $("catHeadLose");

const S = {
  CALM: "CALM",
  WARNING: "WARNING",
  STARE: "STARE",
  ATTACK: "ATTACK",
  GAME_OVER: "GAME_OVER",
};

let state = S.CALM;
let score = 0;
let bestScore = loadBestScore();
let brushProgress = 0;
let nextStareAt = 0;
let pointerDown = false;
let inputLockedUntilRelease = false;
let lastPoint = null;
let lastBrushSoundAt = 0;
let stareStartedAt = 0;
let lastFrame = performance.now();
let bgmOn = false;
let muted = false;
let stareReturnTimer = null;

const audio = {
  bgm: makeAudio("assets/sounds/bgm_loop.wav", { loop: true, volume: 0.38 }),
  brush1: makeAudio("assets/sounds/brush_01.wav", { volume: 0.45 }),
  brush2: makeAudio("assets/sounds/brush_02.wav", { volume: 0.45 }),
  grumble: makeAudio("assets/sounds/cat_grumble.wav", { volume: 0.72 }),
  boom: makeAudio("assets/sounds/boom_stare.mp3", { volume: 0.88 }),
  attackMeow: makeAudio("assets/sounds/cat_attack_meow.wav", { volume: 0.92 }),
  whoosh: makeAudio("assets/sounds/attack_whoosh.wav", { volume: 0.82 }),
  died: makeAudio("assets/sounds/you_died_stinger.wav", { volume: 0.82 }),
  click: makeAudio("assets/sounds/button_click.wav", { volume: 0.5 }),
};

function allAudio() {
  return Object.values(audio);
}

function makeAudio(src, opts = {}) {
  const a = new Audio(src);
  a.preload = "auto";
  a.loop = Boolean(opts.loop);
  a.volume = opts.volume ?? 1;
  return a;
}

function applyMute() {
  for (const a of allAudio()) a.muted = muted;
  soundBtn.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
  soundBtn.setAttribute("aria-label", muted ? "Turn sound on" : "Turn sound off");
}

function toggleMute() {
  muted = !muted;
  applyMute();
  if (!muted) playSound(audio.click);
}

function playSound(a, restart = true) {
  try {
    if (restart) a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_) {}
}

function stopSound(a) {
  try {
    a.pause();
    a.currentTime = 0;
  } catch (_) {}
}

function fadeAudio(a, target, ms = 350) {
  const start = a.volume;
  const t0 = performance.now();

  function step(now) {
    const k = Math.min(1, (now - t0) / ms);
    a.volume = start + (target - start) * k;
    if (k < 1) requestAnimationFrame(step);
    else if (target === 0) a.pause();
  }

  if (target > 0 && a.paused) {
    a.volume = 0;
    playSound(a, false);
  }

  requestAnimationFrame(step);
}


function loadBestScore() {
  try {
    const saved = Number(localStorage.getItem("chailongmeo.bestScore"));
    return Number.isFinite(saved) && saved > 0 ? Math.floor(saved) : 0;
  } catch (_) {
    return 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem("chailongmeo.bestScore", String(bestScore));
  } catch (_) {}
}

function renderScoreHud() {
  scoreEl.textContent = score;
  if (bestScoreEl) bestScoreEl.textContent = bestScore;
}

function maybeUpdateBestScore() {
  if (score > bestScore) {
    bestScore = score;
    saveBestScore();
  }

  renderScoreHud();
}

function randInt(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function randFloat(a, b) {
  return a + Math.random() * (b - a);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getDifficulty() {
  return clamp(score / 45, 0, 1);
}

function rollNextStareGap(isInitial = false) {
  const d = getDifficulty();

  if (isInitial || score <= 0) {
    return randInt(4, 7);
  }

  const minGap = Math.round(clamp(4 - d * 3 + randFloat(-0.6, 0.6), 1, 5));
  const maxGap = Math.round(clamp(7 - d * 4 + randFloat(-1.0, 1.0), minGap + 1, 8));

  return randInt(minGap, maxGap);
}

function scheduleNextStare(isInitial = false) {
  nextStareAt = score + rollNextStareGap(isInitial);
}

function getWarningDelay() {
  const d = getDifficulty();

  const minDelay = clamp(520 - d * 260, 260, 520);
  const maxDelay = clamp(1050 - d * 420, 560, 1050);

  return Math.round(randFloat(minDelay, maxDelay));
}

function getStareSafeMs() {
  const d = getDifficulty();

  const base = 1250 + d * 420;
  const jitter = randFloat(-250, 300);

  return Math.round(clamp(base + jitter, 850, 2100));
}

function getStareGraceMs() {
  const d = getDifficulty();
  return Math.round(clamp(260 - d * 130, 120, 260));
}

function getStareMoveThreshold() {
  const d = getDifficulty();
  return clamp(3.2 - d * 2.0, 1.15, 3.2);
}

function getBrushNeeded() {
  const d = getDifficulty();
  return Math.round(clamp(145 - d * 25, 120, 145));
}

function clearStareTimer() {
  if (stareReturnTimer !== null) {
    clearTimeout(stareReturnTimer);
    stareReturnTimer = null;
  }
}

function hardResetVisuals() {
  document.body.classList.remove("brushing", "warning", "stare", "attack", "game-over");

  catNormal.classList.remove("hidden");
  catBody.classList.add("hidden");
  catHeadStare.classList.add("hidden");
  catHeadLose.classList.add("hidden");

  darkOverlay.style.opacity = "0";
  deathText.classList.add("hidden");
  restartBtn.classList.add("hidden");
}

function setState(next) {
  state = next;

  if (next !== S.STARE) clearStareTimer();

  if (next === S.CALM) {
    hardResetVisuals();
    hintEl.textContent = inputLockedUntilRelease
      ? "Th\u1ea3 chu\u1ed9t r\u1ed3i ch\u1ea3i ti\u1ebfp"
      : "K\u00e9o l\u01b0\u1ee3c l\u00ean l\u01b0ng m\u00e8o";

    if (!bgmOn) {
      bgmOn = true;
      audio.bgm.volume = 0.38;
      playSound(audio.bgm, false);
    }
  }

  if (next === S.WARNING) {
    document.body.classList.remove("brushing", "stare", "attack", "game-over");
    hintEl.textContent = "N\u00f3 b\u1eaft \u0111\u1ea7u kh\u00f3 ch\u1ecbu...";
    document.body.classList.add("warning");
    playSound(audio.grumble);

    setTimeout(() => {
      if (state === S.WARNING) enterStare();
    }, getWarningDelay());
  }

  if (next === S.STARE) {
    document.body.classList.remove("brushing", "warning", "attack", "game-over");
    hintEl.textContent = "D\u1eeaNG L\u1ea0I!";
    document.body.classList.add("stare");

    catNormal.classList.add("hidden");
    catBody.classList.add("hidden");
    catHeadStare.classList.remove("hidden");
    catHeadLose.classList.add("hidden");

    stareStartedAt = performance.now();
  }

  if (next === S.ATTACK) {
    clearStareTimer();
    document.body.classList.remove("brushing", "warning", "stare", "game-over");
    hintEl.textContent = "Sai l\u1ea7m r\u1ed3i.";
    document.body.classList.add("attack");

    catNormal.classList.add("hidden");
    catBody.classList.remove("hidden");
    catHeadStare.classList.add("hidden");
    catHeadLose.classList.remove("hidden");

    darkOverlay.style.opacity = "0.28";
    playSound(audio.attackMeow);
    playSound(audio.whoosh);
    setTimeout(gameOver, 620);
  }

  if (next === S.GAME_OVER) {
    document.body.classList.remove("brushing", "warning", "stare");
    document.body.classList.add("game-over");
    hintEl.textContent = "";
    darkOverlay.style.opacity = "0.76";
    catHeadLose.classList.remove("hidden");
    deathText.classList.remove("hidden");
    restartBtn.classList.remove("hidden");
    playSound(audio.died);
  }
}

function enterStare() {
  bgmOn = false;
  fadeAudio(audio.bgm, 0, 160);
  playSound(audio.boom);
  setState(S.STARE);

  stareReturnTimer = setTimeout(() => {
    if (state === S.STARE) {
      if (pointerDown) inputLockedUntilRelease = true;
      nextRound();
    }
  }, getStareSafeMs());
}

function nextRound() {
  brushProgress = 0;
  scheduleNextStare(false);
  bgmOn = false;
  setState(S.CALM);
}

function gameOver() {
  if (state !== S.ATTACK) return;
  stopSound(audio.bgm);
  bgmOn = false;
  setState(S.GAME_OVER);
}

function resetGame() {
  clearStareTimer();

  score = 0;
  brushProgress = 0;
  nextStareAt = 0;
  pointerDown = false;
  inputLockedUntilRelease = false;
  lastPoint = null;
  scoreEl.textContent = score;

  scheduleNextStare(true);

  stopSound(audio.attackMeow);
  stopSound(audio.whoosh);
  stopSound(audio.died);
  stopSound(audio.boom);

  audio.bgm.volume = 0.38;
  bgmOn = false;
  setState(S.CALM);
}

function startGame() {
  playSound(audio.click);
  startScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  resetGame();
}

function pointFromEvent(e) {
  const p = e.touches?.[0] || e;
  return { x: p.clientX, y: p.clientY };
}

function moveComb(x, y) {
  comb.style.left = `${x}px`;
  comb.style.top = `${y}px`;
}

function rectContains(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function isOnBrushZone(x, y) {
  const catLayer = $("catLayer");
  const r = catLayer.getBoundingClientRect();

  const rx = (x - r.left) / r.width;
  const ry = (y - r.top) / r.height;

  // Generous cat-back hitbox. This is more stable across desktop/mobile
  // than the old invisible #brushZone box.
  return rx >= 0.10 && rx <= 0.82 && ry >= 0.14 && ry <= 0.92;
}

function handleBrushMovement(p, dt) {
  if (state === S.GAME_OVER || state === S.ATTACK) return;

  if (inputLockedUntilRelease) {
    document.body.classList.remove("brushing");
    hintEl.textContent = "Th\u1ea3 chu\u1ed9t r\u1ed3i ch\u1ea3i ti\u1ebfp";
    return;
  }

  if (!pointerDown || !lastPoint) {
    const onCatPreview = isOnBrushZone(p.x, p.y);
    document.body.classList.toggle("brushing", pointerDown && onCatPreview && state !== S.STARE);
    return;
  }

  const dx = p.x - lastPoint.x;
  const dy = p.y - lastPoint.y;
  const dist = Math.hypot(dx, dy);
  const now = performance.now();

  if (state === S.STARE) {
    document.body.classList.remove("brushing");

    if (now - stareStartedAt > getStareGraceMs() && dist > getStareMoveThreshold()) {
      setState(S.ATTACK);
    }

    return;
  }

  const onCat = isOnBrushZone(p.x, p.y);
  document.body.classList.toggle("brushing", pointerDown && onCat && state !== S.STARE);

  if (!onCat) return;
  if (state !== S.CALM) return;

  brushProgress += dist;

  if (now - lastBrushSoundAt > 115) {
    playSound(Math.random() < 0.5 ? audio.brush1 : audio.brush2);
    lastBrushSoundAt = now;
  }

  if (brushProgress > getBrushNeeded()) {
    brushProgress = 0;
    score++;
    maybeUpdateBestScore();

    if (score >= nextStareAt) {
      setState(S.WARNING);
    }
  }
}

stage.addEventListener("pointerdown", (e) => {
  if (state === S.GAME_OVER) return;
  pointerDown = true;
  lastPoint = pointFromEvent(e);
  moveComb(lastPoint.x, lastPoint.y);
  stage.setPointerCapture?.(e.pointerId);
});

stage.addEventListener("pointermove", (e) => {
  const p = pointFromEvent(e);
  moveComb(p.x, p.y);

  const now = performance.now();
  const dt = Math.min(40, now - lastFrame);
  lastFrame = now;

  handleBrushMovement(p, dt);
  lastPoint = p;
});

stage.addEventListener("pointerup", () => {
  pointerDown = false;
  inputLockedUntilRelease = false;
  lastPoint = null;
  document.body.classList.remove("brushing");

  if (state === S.CALM) {
    hintEl.textContent = "K\u00e9o l\u01b0\u1ee3c l\u00ean l\u01b0ng m\u00e8o";
  }
});

stage.addEventListener("pointercancel", () => {
  pointerDown = false;
  inputLockedUntilRelease = false;
  lastPoint = null;
  document.body.classList.remove("brushing");
});

playBtn.addEventListener("click", startGame);

restartBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  playSound(audio.click);
  resetGame();
});

soundBtn.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
});

soundBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMute();
});

window.addEventListener("load", () => {
  renderScoreHud();
  applyMute();
  moveComb(window.innerWidth * 0.58, window.innerHeight * 0.64);
});
