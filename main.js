const $ = (id) => document.getElementById(id);

const startScreen = $("startScreen");
const gameScreen = $("gameScreen");
const playBtn = $("playBtn");
const restartBtn = $("restartBtn");
const soundBtn = $("soundBtn");
const scoreEl = $("score");
const hintEl = $("hint");
const stage = $("stage");
const brushZone = $("brushZone");
const comb = $("comb");
const darkOverlay = $("darkOverlay");
const flashOverlay = $("flashOverlay");
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
let brushProgress = 0;
let nextStareAt = randInt(4, 7);
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
  soundBtn.textContent = muted ? "🔇" : "🔊";
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

function randInt(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function flashScreen() {
  if (!flashOverlay) return;
  flashOverlay.classList.remove("flash-now");
  void flashOverlay.offsetWidth;
  flashOverlay.classList.add("flash-now");
  setTimeout(() => {
    flashOverlay.classList.remove("flash-now");
  }, 320);
}

function attackFlashV13() {
  darkOverlay.style.transition = "none";
  darkOverlay.style.background = "white";
  darkOverlay.style.opacity = "0.96";

  setTimeout(() => {
    darkOverlay.style.opacity = "0";
  }, 55);

  setTimeout(() => {
    darkOverlay.style.background = "black";
    darkOverlay.style.transition = "opacity 280ms ease";
    darkOverlay.style.opacity = "0.18";
  }, 130);
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
      ? "Thả chuột rồi chải tiếp"
      : "Kéo lược lên lưng mèo";

    if (!bgmOn) {
      bgmOn = true;
      audio.bgm.volume = 0.38;
      playSound(audio.bgm, false);
    }
  }

  if (next === S.WARNING) {
    document.body.classList.remove("brushing", "stare", "attack", "game-over");
    hintEl.textContent = "Nó bắt đầu khó chịu...";
    document.body.classList.add("warning");
    playSound(audio.grumble);
    setTimeout(() => {
      if (state === S.WARNING) enterStare();
    }, 850);
  }

  if (next === S.STARE) {
    document.body.classList.remove("brushing", "warning", "attack", "game-over");
    hintEl.textContent = "DỪNG LẠI!";
    document.body.classList.add("stare");

    // Mobile fix: use the full-cat stare image as a replacement sprite.
    catNormal.classList.add("hidden");
    catBody.classList.add("hidden");
    catHeadStare.classList.remove("hidden");
    catHeadLose.classList.add("hidden");

    stareStartedAt = performance.now();
  }

  if (next === S.ATTACK) {
    clearStareTimer();
    document.body.classList.remove("brushing", "warning", "stare", "game-over");
    hintEl.textContent = "Sai lầm rồi.";
    document.body.classList.add("attack");

    catNormal.classList.add("hidden");
    catBody.classList.add("hidden");
    catHeadStare.classList.add("hidden");
    catHeadLose.classList.remove("hidden");

    darkOverlay.style.opacity = "0.18";
    flashScreen();
    playSound(audio.attackMeow);
    playSound(audio.whoosh);
    setTimeout(gameOver, 720);
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
  }, 1450);
}

function nextRound() {
  brushProgress = 0;
  nextStareAt = score + randInt(3, 6);
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
  nextStareAt = randInt(4, 7);
  pointerDown = false;
  inputLockedUntilRelease = false;
  lastPoint = null;
  scoreEl.textContent = score;

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

function getBrushRect() {
  // Compute brush zone from the actual rendered cat size.
  // This works better than hard-coded CSS percentages on mobile.
  const r = catNormal.getBoundingClientRect();

  return {
    left: r.left + r.width * 0.08,
    right: r.left + r.width * 0.62,
    top: r.top + r.height * 0.36,
    bottom: r.top + r.height * 0.78,
  };
}

function updateDebugBrushZone() {
  const r = getBrushRect();
  brushZone.style.left = `${r.left}px`;
  brushZone.style.top = `${r.top}px`;
  brushZone.style.width = `${r.right - r.left}px`;
  brushZone.style.height = `${r.bottom - r.top}px`;
}

function isOnBrushZone(x, y) {
  const r = getBrushRect();
  return rectContains(r, x, y);
}

function handleBrushMovement(p, dt) {
  if (state === S.GAME_OVER || state === S.ATTACK) return;

  if (inputLockedUntilRelease) {
    document.body.classList.remove("brushing");
    hintEl.textContent = "Th? chu?t r?i ch?i ti?p";
    return;
  }

  if (!pointerDown || !lastPoint) {
    document.body.classList.remove("brushing");
    return;
  }

  const dx = p.x - lastPoint.x;
  const dy = p.y - lastPoint.y;
  const dist = Math.hypot(dx, dy);
  const now = performance.now();

  // Important:
  // During STARE, the normal cat image is hidden, so the brush zone can be invalid.
  // The player loses if they keep moving while holding the mouse/finger.
  if (state === S.STARE) {
    if (now - stareStartedAt > 230 && dist > 4.0) {
      setState(S.ATTACK);
    }
    return;
  }

  const onCat = isOnBrushZone(p.x, p.y);
  document.body.classList.toggle("brushing", onCat);

  if (!onCat) return;
  if (state !== S.CALM) return;

  brushProgress += dist;

  if (now - lastBrushSoundAt > 115) {
    playSound(Math.random() < 0.5 ? audio.brush1 : audio.brush2);
    lastBrushSoundAt = now;
  }

  if (brushProgress > 145) {
    brushProgress = 0;
    score++;
    scoreEl.textContent = score;

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
    hintEl.textContent = "Kéo lược lên lưng mèo";
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
  applyMute();
  moveComb(window.innerWidth * 0.58, window.innerHeight * 0.64);
  updateDebugBrushZone();
});

window.addEventListener("resize", updateDebugBrushZone);
window.addEventListener("orientationchange", () => {
  setTimeout(updateDebugBrushZone, 250);
});
