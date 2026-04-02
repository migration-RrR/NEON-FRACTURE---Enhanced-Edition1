// game.js — NEON FRACTURE Enhanced v2
// Изменения v2:
//  - maxHP = 100, startHP = 20; дрон убивает с одного попадания (урон 100)
//  - Мерцающие звёзды на небе
//  - Туман (fog) у горизонта
//  - Летящие неоновые частицы
//  - Улучшенные крыши: больше деталей, неоновые края, окна, вентиляция, антенны
//  - Дождь со свечением (градиентные капли)
//  - Полоска HP: градиент, блики, тряска при уроне, делений
//  - Эффект перемотки: хроматическая аберрация + глитч-полосы + линии сканирования

const canvas = document.getElementById("game");
const ctx    = canvas.getContext("2d");
const startScreen   = document.getElementById("startScreen");
const pauseMenu     = document.getElementById("pauseMenu");
const introText     = document.getElementById("introText");
const settingsModal = document.getElementById("settingsModal");

// === АУДИО (отсутствие файлов не ломает игру) ===
const glitchSound = document.getElementById("glitchSound");
const gameMusic   = document.getElementById("gameMusic");
const fallSound   = document.getElementById("fallSound");
const stepSound   = document.getElementById("stepSound");
const shootSound  = document.getElementById("shootSound");
const deathSound  = document.getElementById("deathSound");

// === FULLSCREEN — canvas всегда равен размеру окна ===
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  // Переинициализируем матрицу при изменении размера
  if (phase === "matrix" || phase === "start") initMatrix();
}
window.addEventListener("resize", resize);
// Также обрабатываем поворот экрана на мобильных
window.addEventListener("orientationchange", () => setTimeout(resize, 200));
resize();

// === СОСТОЯНИЕ ===
let phase        = "start";
let startTime    = null;
let gameStarted  = false;
let musicStarted = false;
let paused       = false;
let cameraX      = 0;
let targetVolume  = 1;
let currentVolume = 1;
let sfxVolume = 1;
let muted     = false;

// === ПЛАТФОРМА ("pc" | "mobile") ===
let platform = null;

// Флаги мобильного управления
let mobileLeft   = false;
let mobileRight  = false;
let mobileJump   = false;
let mobileRewind = false;

function loadSettings() {
  try {
    const mv = localStorage.getItem("musicVolume");
    const sv = localStorage.getItem("sfxVolume");
    const mu = localStorage.getItem("mute");
    if (mv !== null) targetVolume = parseFloat(mv);
    if (sv !== null) sfxVolume    = parseFloat(sv);
    if (mu !== null) muted        = mu === "true";
    document.getElementById("musicVolume").value    = targetVolume;
    document.getElementById("sfxVolume").value      = sfxVolume;
    document.getElementById("muteCheckbox").checked = muted;
  } catch(e) {}
}
loadSettings();

function saveSettings() {
  localStorage.setItem("musicVolume", targetVolume);
  localStorage.setItem("sfxVolume",   sfxVolume);
  localStorage.setItem("mute",        muted);
}

function playSFX(sound) {
  if (muted || !sound) return;
  sound.volume = sfxVolume;
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

// =========================================================
// МАТРИЦА (интро)
// =========================================================
const matrixChars  = "アカサタナハマヤラワ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const matrixColors = ["#39FF14","#00aaff","#DF2531","#F8F8F8","#FF44CC"];
const fontSize = 14;
let columns = 0, drops = [];

function initMatrix() {
  columns = Math.floor(canvas.width / fontSize);
  drops = Array.from({ length: columns }, () => Math.random() * (canvas.height / fontSize));
}
initMatrix();

function drawMatrix() {
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < drops.length; i++) {
    ctx.fillStyle = matrixColors[Math.floor(Math.random() * matrixColors.length)];
    ctx.font = fontSize + "px monospace";
    ctx.fillText(matrixChars[Math.floor(Math.random() * matrixChars.length)], i * fontSize, drops[i] * fontSize);
    if (drops[i] * fontSize > canvas.height && Math.random() > 0.98) drops[i] = 0;
    drops[i]++;
  }
  if (Math.random() < 0.05) {
    ctx.fillStyle = "rgba(223,37,49,0.08)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// =========================================================
// ИНТРО
// =========================================================
const introLines = [
  "...signal lost...",
  "reconstructing memory...",
  "ERROR: temporal fracture",
  "You should not have returned",
  "..."
];

function updateIntro(time) {
  if (!startTime) return;
  const t = (time - startTime) / 1000;
  if (t < 12) {
    phase = "matrix";
  } else if (t < 19) {
    phase = "text";
    const idx = Math.floor((t - 12) / 1.4);
    if (idx < introLines.length) {
      introText.textContent = introLines[idx];
      introText.style.opacity = 1;
      introText.classList.add("glitch-text");
    } else {
      introText.style.opacity = 0;
    }
  } else {
    phase = "game";
    gameStarted = true;
    introText.style.display = "none";
    introText.classList.remove("glitch-text");
    if (!musicStarted) {
      musicStarted = true;
      try { glitchSound.pause(); glitchSound.currentTime = 0; } catch(e) {}
      try { gameMusic.currentTime = 0; gameMusic.volume = currentVolume; gameMusic.play().catch(() => {}); } catch(e) {}
    }
  }
}

// =========================================================
// HP И СМЕРТЬ
// =========================================================
const maxHP  = 100;
let playerHP = 20;   // при первом появлении — 20 HP

let abilitiesUnlocked   = false;
let rewindCooldown      = 0;
let deathEffect         = 0;
let deathGlitch         = 0;
let deathSequenceActive = false;
let hpShakeTimer = 0;
let hpFlashTimer = 0;

function takeDamage(amount) {
  if (deathEffect > 0 || deathSequenceActive) return;
  playerHP     = Math.max(0, playerHP - amount);
  hpShakeTimer = 18;
  hpFlashTimer = 14;
  deathGlitch  = 14;
  if (playerHP <= 0) startDeathSequence(!abilitiesUnlocked);
}

function startDeathSequence(firstDeath) {
  if (deathSequenceActive) return;
  deathSequenceActive = true;
  playerHP    = 0;
  deathEffect = 55;
  deathGlitch = 30;
  playSFX(deathSound);
  if (firstDeath) {
    setTimeout(() => {
      performRewind(true);
      abilitiesUnlocked   = true;
      playerHP            = maxHP;
      deathSequenceActive = false;
    }, 900);
  } else {
    setTimeout(() => {
      respawnGame();
      deathSequenceActive = false;
    }, 900);
  }
}

function respawnGame() {
  const near = rooftops.find(rt => rt.x + rt.width > cameraX);
  if (near) { player.x = near.x + 50; player.y = near.y - player.h; }
  else       { player.x = cameraX + 200; player.y = canvas.height - 320; }
  player.vy = 0; player.isJumping = false; player.spawnAlpha = 0;
  playerHP = maxHP; drone = null; playerBullets = []; enemyBullets = [];
  // droneKilled НЕ сбрасываем — если дрон убит игроком, он не вернётся
  deathEffect = 0; deathGlitch = 0;
}

// =========================================================
// ЗВЁЗДЫ
// =========================================================
const stars = Array.from({ length: 220 }, () => ({
  x:       Math.random() * 5000,
  y:       Math.random() * window.innerHeight * 0.70,
  r:       Math.random() * 1.6 + 0.3,
  phase:   Math.random() * Math.PI * 2,
  speed:   0.018 + Math.random() * 0.025,
  color:   Math.random() > 0.92 ? "#00aaff" : (Math.random() > 0.88 ? "#ff6688" : "#F8F8F8")
}));

function drawStars() {
  for (const s of stars) {
    const sx = ((s.x - cameraX * 0.04) % 5000 + 5000) % 5000;
    s.phase += s.speed;
    const alpha = 0.35 + Math.sin(s.phase) * 0.45;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    if (s.r > 1.1) { ctx.shadowBlur = 7; ctx.shadowColor = s.color; }
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(sx, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// =========================================================
// ЧАСТИЦЫ — неоновые светлячки / дым
// =========================================================
function makeParticle(init) {
  return {
    x:       init ? Math.random() * 5000 : cameraX + canvas.width + 20,
    y:       20 + Math.random() * canvas.height * 0.85,
    vx:      -(0.2 + Math.random() * 0.7),
    vy:      (Math.random() - 0.5) * 0.35,
    r:       0.8 + Math.random() * 2.2,
    alpha:   0.1 + Math.random() * 0.55,
    life:    0,
    maxLife: 280 + Math.random() * 380,
    color:   ["#39FF14","#00aaff","#DF2531","#ff88ff"][Math.floor(Math.random() * 4)],
    pulse:   Math.random() * Math.PI * 2
  };
}
const particles = Array.from({ length: 65 }, () => makeParticle(true));

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x    += p.vx;
    p.y    += p.vy + Math.sin(p.pulse) * 0.18;
    p.pulse += 0.038;
    p.life++;
    if (p.life > p.maxLife || p.x < cameraX - 150) {
      particles[i] = makeParticle(false);
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    const fi = Math.min(1, p.life / 35);
    const fo = Math.min(1, (p.maxLife - p.life) / 55);
    const a  = p.alpha * fi * fo;
    if (a <= 0.01) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowBlur  = 10;
    ctx.shadowColor = p.color;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x - cameraX, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// =========================================================
// ТУМАН
// =========================================================
function drawFog() {
  const fy  = canvas.height * 0.48;
  const fog = ctx.createLinearGradient(0, fy, 0, canvas.height - 50);
  fog.addColorStop(0,   "rgba(0,4,18,0)");
  fog.addColorStop(0.5, `rgba(0,8,28,${0.17 + Math.sin(Date.now() * 0.0007) * 0.05})`);
  fog.addColorStop(1,   "rgba(0,8,22,0.42)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, fy, canvas.width, canvas.height - fy);
}

// =========================================================
// ДОЖДЬ
// =========================================================
const rain = Array.from({ length: 310 }, () => ({
  x:     Math.random() * window.innerWidth,
  y:     Math.random() * window.innerHeight,
  len:   12 + Math.random() * 26,
  speed: 5 + Math.random() * 8,
  alpha: 0.15 + Math.random() * 0.4
}));

function drawRain() {
  ctx.save();
  for (const r of rain) {
    const rg = ctx.createLinearGradient(r.x, r.y, r.x - 1.5, r.y + r.len);
    rg.addColorStop(0, "rgba(0,170,255,0)");
    rg.addColorStop(0.5, `rgba(30,180,255,${r.alpha})`);
    rg.addColorStop(1,   `rgba(120,230,255,${r.alpha * 0.5})`);
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x - 1.5, r.y + r.len);
    ctx.strokeStyle = rg;
    ctx.lineWidth   = 1.1;
    ctx.stroke();
    r.y += r.speed;
    if (r.y > canvas.height) { r.y = -20; r.x = Math.random() * canvas.width; }
  }
  ctx.restore();
}

// =========================================================
// ОБЛАКА
// =========================================================
const clouds = Array.from({ length: 14 }, () => ({
  x: Math.random() * 5500,
  y: 30 + Math.random() * 180,
  w: 240 + Math.random() * 520,
  h: 45  + Math.random() * 90
}));

function drawClouds() {
  ctx.save();
  ctx.filter = "blur(30px)";
  for (const c of clouds) {
    const cx = ((c.x - cameraX * 0.14) % 5500 + 5500) % 5500;
    const g  = ctx.createLinearGradient(cx, c.y, cx, c.y + c.h);
    g.addColorStop(0, `rgba(18,0,45,${0.11 + Math.sin(Date.now() * 0.0003) * 0.04})`);
    g.addColorStop(1, "rgba(0,8,38,0.05)");
    ctx.fillStyle = g;
    ctx.fillRect(cx, c.y, c.w, c.h);
  }
  ctx.restore();
}

// =========================================================
// ЗДАНИЯ (фон)
// =========================================================
const cityLayers = [
  { speed:0.07, c1:"#04041a", c2:"#08082a", hMin:1200, hMax:1900, wMin:260, wMax:530, gap:8 },
  { speed:0.27, c1:"#080820", c2:"#0e0e2e", hMin: 800, hMax:1350, wMin:230, wMax:470, gap:6 },
  { speed:0.54, c1:"#0e0e28", c2:"#161636", hMin: 580, hMax:1060, wMin:185, wMax:410, gap:5 }
];
const buildings = cityLayers.map(layer => {
  const arr = []; let cx = -1500;
  for (let i = 0; i < 140; i++) {
    const w = layer.wMin + Math.random() * (layer.wMax - layer.wMin);
    arr.push({
      x: cx, w,
      h:         layer.hMin + Math.random() * (layer.hMax - layer.hMin),
      accent:    Math.random() > 0.5 ? "#39FF14" : "#00aaff",
      hasSpire:  Math.random() > 0.35,
      winSeed:   Math.random() * 2000
    });
    cx += w + layer.gap;
  }
  return arr;
});

function drawBuildings() {
  const gY = canvas.height - 80;
  const now = Date.now();
  cityLayers.forEach((layer, li) => {
    buildings[li].forEach(b => {
      const bx = b.x - cameraX * layer.speed;
      if (bx + b.w < -10 || bx > canvas.width + 10) return;
      const g = ctx.createLinearGradient(bx, gY - b.h, bx, gY);
      g.addColorStop(0, layer.c1); g.addColorStop(1, layer.c2);
      ctx.fillStyle = g;
      ctx.fillRect(bx, gY - b.h, b.w, b.h);
      // Мерцающие окна
      for (let wy = gY - b.h + 22; wy < gY - 18; wy += 35) {
        for (let wx = bx + 9; wx < bx + b.w - 9; wx += 28) {
          const on = Math.sin(now * 0.004 + wx * 0.09 + b.winSeed) > 0.05;
          if (!on) continue;
          const wa = 0.1 + Math.abs(Math.sin(now * 0.003 + wy * 0.05 + b.winSeed)) * 0.2;
          ctx.fillStyle = Math.random() > 0.65 ? `rgba(0,170,255,${wa})` : `rgba(57,255,20,${wa})`;
          ctx.fillRect(wx, wy, 10, 14);
        }
      }
      // Шпиль и неоновый верх
      ctx.shadowBlur = 12; ctx.shadowColor = b.accent;
      ctx.fillStyle  = b.accent;
      ctx.fillRect(bx, gY - b.h, b.w, 3);
      if (b.hasSpire) {
        ctx.fillRect(bx + b.w / 2 - 2, gY - b.h - 62, 4, 62);
        const blink = Math.abs(Math.sin(now * 0.0022 + b.x * 0.001));
        ctx.fillStyle = `rgba(255,55,55,${blink})`;
        ctx.beginPath(); ctx.arc(bx + b.w / 2, gY - b.h - 64, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
    });
  });
}

// =========================================================
// КРЫШИ
// =========================================================
let rooftops = [];
const RT_GEN  = 950;
const RT_MINW = 230, RT_MAXW = 450;
const RT_MING = 10,  RT_MAXG = 28;
const RT_MINH = 175, RT_MAXH = 265;

function generateRooftop(x) {
  const w  = RT_MINW + Math.random() * (RT_MAXW - RT_MINW);
  const sh = RT_MINH + Math.random() * (RT_MAXH - RT_MINH);
  return {
    x, y: canvas.height - sh, width: w, height: sh,
    slope:       Math.random() > 0.62 ? 5 + Math.random() * 10 : 0,
    hasRail:     Math.random() > 0.42,
    railColor:   Math.random() > 0.5 ? "#39FF14" : "#00aaff",
    hasAntenna:  Math.random() > 0.62,
    hasChimney:  Math.random() > 0.73,
    hasVent:     Math.random() > 0.68,
    hasTank:     Math.random() > 0.82,
    accentColor: Math.random() > 0.5 ? "#39FF14" : "#00aaff",
    winSeed:     Math.random() * 1500
  };
}

function initRooftops() {
  rooftops = [];
  let sx = 0;
  for (let i = 0; i < 28; i++) {
    const rt = generateRooftop(sx);
    rooftops.push(rt);
    sx += rt.width + RT_MING + Math.random() * (RT_MAXG - RT_MING);
  }
}

function updateRooftops() {
  rooftops = rooftops.filter(rt => rt.x + rt.width > cameraX - 700);
  let lx = rooftops.length
    ? rooftops[rooftops.length - 1].x + rooftops[rooftops.length - 1].width
    : cameraX + canvas.width;
  while (lx < cameraX + canvas.width + RT_GEN) {
    const gap = RT_MING + Math.random() * (RT_MAXG - RT_MING);
    const rt  = generateRooftop(lx + gap);
    rooftops.push(rt); lx = rt.x + rt.width;
  }
}

function drawRooftops() {
  const now = Date.now();
  for (const rt of rooftops) {
    const x = rt.x - cameraX, y = rt.y, w = rt.width, h = rt.height;

    // Тело
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, "#1a1a28"); bg.addColorStop(1, "#09090f");
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);

    // Скат
    if (rt.slope > 0) {
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + w, y - rt.slope); ctx.lineTo(x + w, y);
      ctx.closePath();
      ctx.fillStyle = "#212130"; ctx.fill();
    }

    // Горизонтальные панели (текстура)
    ctx.fillStyle = "rgba(255,255,255,0.018)";
    for (let py = y + 8; py < y + h; py += 20) ctx.fillRect(x, py, w, 1);

    // Неоновый верхний край
    ctx.shadowBlur = 11; ctx.shadowColor = rt.accentColor;
    ctx.fillStyle  = rt.accentColor;
    ctx.fillRect(x, y, w, 3);
    ctx.shadowBlur = 0;

    // Боковые полосы
    ctx.fillStyle = "rgba(0,170,255,0.12)";
    ctx.fillRect(x, y, 2, h); ctx.fillRect(x + w - 2, y, 2, h);

    // Парапет
    if (rt.hasRail) {
      ctx.fillStyle = "#262636";
      ctx.fillRect(x, y - 9, w, 9);
      ctx.shadowBlur = 5; ctx.shadowColor = rt.railColor;
      ctx.fillStyle  = rt.railColor;
      ctx.fillRect(x, y - 9, w, 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle  = "#3a3a50";
      for (let px = x + 14; px < x + w - 8; px += 38) ctx.fillRect(px, y - 9, 3, 9);
    }

    // Антенна
    if (rt.hasAntenna) {
      const ax = x + w * 0.56;
      ctx.fillStyle = "#909090";
      ctx.fillRect(ax - 1, y - 32, 2, 32);
      ctx.fillRect(ax - 8, y - 23, 16, 2);
      ctx.fillRect(ax - 6, y - 16, 12, 2);
      const blink = Math.abs(Math.sin(now * 0.003 + rt.x * 0.002));
      ctx.shadowBlur = 12; ctx.shadowColor = "#ff4444";
      ctx.fillStyle  = `rgba(255,60,60,${0.15 + blink * 0.85})`;
      ctx.beginPath(); ctx.arc(ax, y - 33, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Вентиляция
    if (rt.hasVent) {
      const vx = x + w * 0.24;
      ctx.fillStyle = "#2e2e44"; ctx.fillRect(vx, y - 14, 20, 15);
      ctx.fillStyle = "#404058"; ctx.fillRect(vx - 2, y - 15, 24, 4);
      // Пар
      ctx.save();
      ctx.globalAlpha = 0.12 + Math.sin(now * 0.005) * 0.04;
      ctx.fillStyle   = "#aac8ff";
      ctx.beginPath(); ctx.ellipse(vx + 10, y - 20, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Труба
    if (rt.hasChimney) {
      const ch = x + w - 42;
      ctx.fillStyle = "#5a3a28"; ctx.fillRect(ch, y - 24, 14, 27);
      ctx.fillStyle = "#3e281a"; ctx.fillRect(ch - 2, y - 26, 18, 4);
    }

    // Водяной бак
    if (rt.hasTank) {
      const tx = x + w * 0.34;
      ctx.fillStyle = "#252535"; ctx.fillRect(tx, y - 22, 24, 23);
      ctx.fillStyle = "#181820"; ctx.fillRect(tx + 2, y - 10, 20, 11);
      ctx.fillStyle = "#555";
      ctx.fillRect(tx, y, 4, 6); ctx.fillRect(tx + 20, y, 4, 6);
    }

    // Окна на фасаде
    const wg = 0.22 + Math.sin(now * 0.005 + rt.winSeed) * 0.12;
    for (let i = 0; i < 6; i++) {
      const wx = x + 14 + i * 42;
      if (wx + 14 > x + w - 8) break;
      ctx.fillStyle = `rgba(0,170,255,${wg * 0.65})`;
      ctx.fillRect(wx, y + 10, 14, 11);
      ctx.fillStyle = `rgba(57,255,20,${wg})`;
      ctx.fillRect(wx + 2, y + 11, 10, 9);
    }

    // Нижняя синяя полоска
    ctx.fillStyle = "rgba(0,170,255,0.28)";
    ctx.fillRect(x, y + h - 2, w, 2);
  }
}

// =========================================================
// КОЛЛИЗИЯ
// =========================================================
function applyRooftopCollision() {
  player.vy += gravity;
  player.y  += player.vy;
  let onGround = false;
  for (const rt of rooftops) {
    if (player.x + player.w > rt.x && player.x < rt.x + rt.width) {
      const rtTop = rt.y;
      if (player.vy >= 0 && player.y + player.h > rtTop && player.y + player.h < rtTop + 26 + player.vy + 2) {
        player.y = rtTop - player.h; player.vy = 0;
        player.isJumping = false; player.fallSoundPlayed = false;
        onGround = true;
      }
    }
  }
  if (!onGround) player.isJumping = true;
  if (player.y + player.h > canvas.height + 140 && !deathSequenceActive) {
    startDeathSequence(!abilitiesUnlocked);
  }
}

// =========================================================
// ДРОН
// =========================================================
let drone = null;
let droneKilled = false;  // true только если дрон уничтожен лазерами игрока

function spawnDrone() {
  if (drone || droneKilled) return;  // не спавним если уже живой или убит игроком
  drone = { x: player.x + 360, y: player.y - 100, width: 46, height: 30, shootTimer: 80, health: 50, flyOffset: 0 };
}

function updateDrone() {
  if (!drone) return;
  drone.x += (player.x + 230 - drone.x) * 0.018;
  drone.flyOffset += 0.033;
  drone.y = player.y - 90 + Math.sin(drone.flyOffset) * 22;
  if (drone.shootTimer <= 0) {
    const cx = drone.x + drone.width / 2, cy = drone.y + drone.height / 2;
    const dx = player.x + player.w / 2 - cx, dy = player.y + player.h / 2 - cy;
    const len = Math.hypot(dx, dy);
    if (len > 0) enemyBullets.push({ x: cx, y: cy, vx: dx / len * 6, vy: dy / len * 6 });
    drone.shootTimer = 140;  // реже стреляет
  } else drone.shootTimer--;
}

function drawDrone() {
  if (!drone) return;
  const x = drone.x - cameraX, y = drone.y;
  ctx.save();
  ctx.shadowBlur = 16; ctx.shadowColor = "#ffffff";
  ctx.fillStyle  = "#d6d6e8"; ctx.fillRect(x, y + 9, drone.width, drone.height - 9);
  ctx.shadowColor = "#DF2531"; ctx.fillStyle = "#DF2531";
  ctx.fillRect(x + 4, y + 11, drone.width - 8, 5);
  ctx.shadowColor = "#00aaff"; ctx.fillStyle = "#00aaff";
  ctx.beginPath(); ctx.arc(x + drone.width / 2, y + 20, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#003355";
  ctx.beginPath(); ctx.arc(x + drone.width / 2, y + 20, 3.5, 0, Math.PI * 2); ctx.fill();
  // Пропеллеры
  ctx.strokeStyle = "rgba(200,200,255,0.55)"; ctx.lineWidth = 2.2;
  const ps = Date.now() * 0.025;
  const prop = (px, py) => {
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(ps)*15, py + Math.sin(ps)*4);
    ctx.lineTo(px - Math.cos(ps)*15, py - Math.sin(ps)*4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(ps+1.57)*15, py + Math.sin(ps+1.57)*4);
    ctx.lineTo(px - Math.cos(ps+1.57)*15, py - Math.sin(ps+1.57)*4);
    ctx.stroke();
  };
  prop(x + 11, y + 6); prop(x + drone.width - 11, y + 6);
  ctx.fillStyle = drone.shootTimer < 20 ? "#DF2531" : "#39FF14";
  ctx.fillRect(x + drone.width - 9, y + 15, 5, 5);
  ctx.restore();
}

// =========================================================
// ВЗРЫВ ДРОНА — частицы
// =========================================================
let explosionParticles = [];

function createExplosion(wx, wy) {
  for (let i = 0; i < 28; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const speed  = 1.5 + Math.random() * 5;
    const colors = ["#DF2531","#ff6644","#ffaa00","#ffffff","#00aaff"];
    explosionParticles.push({
      x:       wx,
      y:       wy,
      vx:      Math.cos(angle) * speed,
      vy:      Math.sin(angle) * speed - 1,
      r:       2 + Math.random() * 4,
      life:    0,
      maxLife: 35 + Math.random() * 30,
      color:   colors[Math.floor(Math.random() * colors.length)]
    });
  }
}

function updateExplosionParticles() {
  for (let i = explosionParticles.length - 1; i >= 0; i--) {
    const p = explosionParticles[i];
    p.x  += p.vx; p.y += p.vy;
    p.vy += 0.18;  // гравитация
    p.vx *= 0.94;
    p.r  *= 0.97;
    p.life++;
    if (p.life > p.maxLife || p.r < 0.4) explosionParticles.splice(i, 1);
  }
}

function drawExplosionParticles() {
  for (const p of explosionParticles) {
    const alpha = 1 - p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = p.color;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x - cameraX, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}


let playerBullets = [], enemyBullets = [];

canvas.addEventListener("click", (e) => {
  if (platform !== "pc") return;   // мышь только на ПК
  if (!gameStarted || paused || !abilitiesUnlocked) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width) + cameraX;
  const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
  const cx = player.x + player.w / 2, cy = player.y + player.h / 2;
  const len = Math.hypot(mx - cx, my - cy);
  if (len > 0) {
    playerBullets.push({ x: cx, y: cy, vx: (mx - cx) / len * 10, vy: (my - cy) / len * 10 });
    playSFX(shootSound);
    startShootAnimation();
  }
});

function updateBullets() {
  for (let i = playerBullets.length - 1; i >= 0; i--) {
    const b = playerBullets[i];
    b.x += b.vx; b.y += b.vy;
    if (b.x < cameraX - 400 || b.x > cameraX + canvas.width + 400 || b.y < -200 || b.y > canvas.height + 200) {
      playerBullets.splice(i, 1); continue;
    }
    if (drone && b.x > drone.x && b.x < drone.x + drone.width && b.y > drone.y && b.y < drone.y + drone.height) {
      drone.health -= 10;
      playerBullets.splice(i, 1);
      if (drone.health <= 0) {
        createExplosion(drone.x + drone.width / 2, drone.y + drone.height / 2);
        drone = null;
        droneKilled = true;  // убит игроком — больше не появится
      }
    }
  }
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx; b.y += b.vy;
    if (b.x < cameraX - 400 || b.x > cameraX + canvas.width + 400 || b.y < -200 || b.y > canvas.height + 200) {
      enemyBullets.splice(i, 1); continue;
    }
    if (b.x > player.x && b.x < player.x + player.w && b.y > player.y && b.y < player.y + player.h) {
      // Дрон наносит 20 урона за попадание
      takeDamage(20);
      enemyBullets.splice(i, 1);
    }
  }
}

function drawBullets() {
  for (const b of playerBullets) {
    ctx.save(); ctx.shadowBlur = 12; ctx.shadowColor = "#00aaff";
    ctx.fillStyle = "#00aaff";
    ctx.fillRect(b.x - cameraX - 5, b.y - 2, 10, 4);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(b.x - cameraX - 5 - b.vx * 1.5, b.y - 1, b.vx * 1.5, 2);
    ctx.restore();
  }
  for (const b of enemyBullets) {
    ctx.save(); ctx.shadowBlur = 12; ctx.shadowColor = "#DF2531";
    ctx.fillStyle = "#DF2531";
    ctx.fillRect(b.x - cameraX - 5, b.y - 2, 10, 4);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(b.x - cameraX - 5 - b.vx * 1.5, b.y - 1, b.vx * 1.5, 2);
    ctx.restore();
  }
}

// =========================================================
// ИСТОРИЯ / ПЕРЕМОТКА
// =========================================================
let history = [], frameCounter = 0;

function saveState() {
  if (!gameStarted || paused) return;
  if (frameCounter++ % 6 !== 0) return;
  history.push({
    player: { x:player.x, y:player.y, vy:player.vy, facing:player.facing, isJumping:player.isJumping, hp:Math.max(1,playerHP) },
    drone:  drone ? { ...drone } : null,
    playerBullets: playerBullets.map(b=>({...b})),
    enemyBullets:  enemyBullets.map(b=>({...b}))
  });
  if (history.length > 350) history.shift();
}

let rewindEffect   = 0;
const REWIND_TOTAL = 25;   // длительность в кадрах (~0.4 сек при 60fps)

// Частицы времени для эффекта перемотки
let rewindParticles = [];

function spawnRewindParticles() {
  rewindParticles = [];
  const colors = ["#39FF14","#00aaff","#DF2531","#ffffff","#cc88ff","#ffdd00"];
  for (let i = 0; i < 80; i++) {
    rewindParticles.push({
      x:      Math.random() * canvas.width,
      y:      Math.random() * canvas.height,
      vx:     (Math.random() - 0.5) * 6 - 2,  // смещение влево/вправо + дрейф назад
      vy:     -(2 + Math.random() * 6),          // вверх — «назад во времени»
      r:      1.5 + Math.random() * 3.5,
      alpha:  0.7 + Math.random() * 0.3,
      color:  colors[Math.floor(Math.random() * colors.length)],
      trail:  [],  // хвост
      spin:   (Math.random() - 0.5) * 0.3
    });
  }
}

function performRewind(automatic = false) {
  if (!abilitiesUnlocked && !automatic) return;
  if (rewindCooldown > 0 && !automatic)  return;
  if (history.length < 2)                return;
  const s = history[Math.max(0, history.length - 55)];
  player.x=s.player.x; player.y=s.player.y; player.vy=s.player.vy;
  player.facing=s.player.facing; player.isJumping=s.player.isJumping;
  playerHP      = s.player.hp;
  drone         = s.drone ? { ...s.drone } : null;
  playerBullets = s.playerBullets.map(b=>({...b}));
  enemyBullets  = s.enemyBullets.map(b=>({...b}));
  deathGlitch   = 10;
  rewindEffect  = REWIND_TOTAL;
  spawnRewindParticles();
  if (!automatic) rewindCooldown = 150;
}

function drawRewindEffect() {
  if (rewindEffect <= 0) return;

  const t     = rewindEffect / REWIND_TOTAL;  // 1 → 0 по мере угасания
  const phase = 1 - t;                         // 0 → 1

  ctx.save();

  // ── 1. ВСПЫШКА В НАЧАЛЕ (первые 4 кадра) ──────────────────────────────
  if (rewindEffect > REWIND_TOTAL - 4) {
    const flashT = (rewindEffect - (REWIND_TOTAL - 4)) / 4;
    ctx.fillStyle = `rgba(0,170,255,${flashT * 0.55})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Белый обод
    ctx.shadowBlur  = 40;
    ctx.shadowColor = "#00aaff";
    ctx.strokeStyle = `rgba(255,255,255,${flashT * 0.9})`;
    ctx.lineWidth   = 6;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur  = 0;
  }

  // ── 2. ВОЛНОВОЕ ИСКАЖЕНИЕ (синусоидальный сдвиг строк) ────────────────
  const waveAmp   = t * 18;
  const waveFreq  = 0.04 + phase * 0.06;
  const waveSpeed = Date.now() * 0.015;
  const stripeH   = 6;
  for (let sy = 0; sy < canvas.height; sy += stripeH) {
    const shiftX = Math.sin(sy * waveFreq + waveSpeed) * waveAmp;
    if (Math.abs(shiftX) > 0.5) {
      ctx.drawImage(canvas, 0, sy, canvas.width, stripeH, shiftX, sy, canvas.width, stripeH);
    }
  }

  // ── 3. ЦВЕТОВЫЕ НАЛОЖЕНИЯ (переливы зелёный→синий→красный) ───────────
  const hueShift = phase * Math.PI * 2;
  const r = Math.max(0, Math.sin(hueShift) * 80);
  const g = Math.max(0, Math.sin(hueShift + 2.1) * 80);
  const b = Math.max(0, Math.sin(hueShift + 4.2) * 80);
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = t * 0.22;
  ctx.fillStyle   = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  // ── 4. ЧАСТИЦЫ ВРЕМЕНИ ────────────────────────────────────────────────
  for (const p of rewindParticles) {
    p.x += p.vx; p.y += p.vy;
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 8) p.trail.shift();
    // Хвост
    for (let ti = 0; ti < p.trail.length - 1; ti++) {
      const ta = (ti / p.trail.length) * p.alpha * t * 0.6;
      ctx.beginPath();
      ctx.moveTo(p.trail[ti].x,     p.trail[ti].y);
      ctx.lineTo(p.trail[ti + 1].x, p.trail[ti + 1].y);
      ctx.strokeStyle = p.color;
      ctx.lineWidth   = p.r * (ti / p.trail.length);
      ctx.globalAlpha = ta;
      ctx.stroke();
    }
    // Ядро частицы
    ctx.globalAlpha = p.alpha * t;
    ctx.shadowBlur  = 12;
    ctx.shadowColor = p.color;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    // Перезапуск вылетевших частиц
    if (p.y < -20 || p.x < -20 || p.x > canvas.width + 20) {
      p.x = Math.random() * canvas.width;
      p.y = canvas.height + 10;
      p.trail = [];
    }
  }

  // ── 5. ТРЕЩИНЫ РЕАЛЬНОСТИ ─────────────────────────────────────────────
  if (t > 0.35) {
    const crackCount = Math.floor(t * 5);
    ctx.strokeStyle = `rgba(0,170,255,${t * 0.7})`;
    ctx.shadowBlur  = 10;
    ctx.shadowColor = "#00aaff";
    ctx.lineWidth   = 1.5;
    for (let ci = 0; ci < crackCount; ci++) {
      // Каждая трещина — случайная ломаная из 4–6 сегментов
      const seed  = ci * 137.5;  // детерминированный "случай" чтобы не прыгало
      const cx0   = (Math.sin(seed) * 0.5 + 0.5) * canvas.width;
      const cy0   = (Math.cos(seed * 1.3) * 0.5 + 0.5) * canvas.height;
      ctx.beginPath();
      ctx.moveTo(cx0, cy0);
      let cx = cx0, cy = cy0;
      for (let seg = 0; seg < 5; seg++) {
        cx += (Math.sin(seed + seg * 2.7 + Date.now() * 0.002) * 80 * t);
        cy += (Math.cos(seed + seg * 1.9 + Date.now() * 0.002) * 60 * t);
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  // ── 6. ЛЕТЯЩИЕ ЦИФРЫ (таймер времени) ────────────────────────────────
  if (t > 0.5) {
    ctx.font        = `bold ${Math.floor(14 + t * 20)}px 'Courier New'`;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = "#39FF14";
    ctx.fillStyle   = `rgba(57,255,20,${t * 0.6})`;
    const digits    = ["00:00","23:59","12:34","99:99","--:--","<<RWD"];
    const dIdx      = Math.floor((Date.now() / 80) % digits.length);
    ctx.fillText(digits[dIdx], canvas.width / 2 - 60, canvas.height / 2);
    ctx.shadowBlur  = 0;
  }

  // ── 7. ВИНЬЕТКА + РАМКА ───────────────────────────────────────────────
  const vig = ctx.createRadialGradient(
    canvas.width/2, canvas.height/2, canvas.height * 0.2,
    canvas.width/2, canvas.height/2, canvas.height * 0.85
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, `rgba(0,10,40,${t * 0.55})`);
  ctx.fillStyle   = vig;
  ctx.globalAlpha = 1;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.shadowBlur  = 20 * t;
  ctx.shadowColor = "#00aaff";
  ctx.strokeStyle = `rgba(0,170,255,${t * 0.8})`;
  ctx.lineWidth   = 3;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.shadowBlur  = 0;

  ctx.restore();
  rewindEffect--;
  if (rewindEffect <= 0) rewindParticles = [];
}

// =========================================================
// АНИМАЦИИ
// =========================================================
let shootAnimationTimer = 0;
function startShootAnimation() { shootAnimationTimer = 10; }
function updateShootAnimation() { if (shootAnimationTimer > 0) shootAnimationTimer--; }

// =========================================================
// ИГРОК (пиксельный)
// =========================================================
let player = {
  x:300, y:-200, w:40, h:80,
  vy:0, facing:1, isJumping:false,
  spawnAlpha:0, walkCycle:0, fallSoundPlayed:false
};
const gravity = 0.55, jumpPower = -10.5, walkSpeed = 3.5;
let keys = {};

document.addEventListener("keydown", e => {
  keys[e.key] = true;
  if (e.key === "Escape" && gameStarted) {
    paused = !paused;
    targetVolume = paused ? 0.3 : 1;
    pauseMenu.style.display = paused ? "flex" : "none";
  }
});
document.addEventListener("keyup", e => { keys[e.key] = false; });

let lastStepTime = 0;
function updateWalkCycle(now) {
  if (!gameStarted || paused) return;
  const moving = keys["d"] || keys["a"] || keys["ArrowLeft"] || keys["ArrowRight"];
  if (moving && !player.isJumping) {
    player.walkCycle += 0.20;
    if (now - lastStepTime >= 275) { lastStepTime = now; playSFX(stepSound); }
  } else {
    player.walkCycle *= 0.87;
  }
}

function drawHero(x, y, facing = 1) {
  const sc = 3.5;
  ctx.save();
  ctx.translate(x - cameraX, y);
  if (facing === -1) { ctx.scale(-1, 1); ctx.translate(-18 * sc, 0); }

  function p(px, py, w, h, color, glow = false) {
    if (glow) { ctx.shadowBlur = 12; ctx.shadowColor = color; } else ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillRect(px * sc, py * sc, w * sc, h * sc);
    ctx.shadowBlur = 0;
  }

  const leg  = Math.sin(player.walkCycle) * 3;
  const armS = Math.sin(player.walkCycle + 1.4) * 2.5;

  // Ноги (анимация ходьбы)
  p(5,  26 + leg, 3, 8, "#0f0f0f");
  p(10, 26 - leg, 3, 8, "#0f0f0f");
  p(4,  33 + leg, 4, 2, "#000");
  p(9,  33 - leg, 4, 2, "#000");
  p(5,  34 + leg, 1, 1, "#39FF14", true);
  p(12, 34 - leg, 1, 1, "#00aaff", true);

  // Пояс
  p(5, 23, 8, 4, "#202020"); p(5, 24, 8, 1, "#000");

  // Туловище
  p(4, 11, 10, 13, "#0f0f0f"); p(7, 11, 4, 13, "#F8F8F8"); p(8, 11, 2, 13, "#0f0f0f");
  p(4, 11, 4, 2, "#DF2531"); p(11, 11, 3, 2, "#0f0f0f"); p(11, 13, 2, 1, "#DF2531");

  // Левая рука (анимация)
  p(2 + armS, 12 - armS, 3, 9, "#0f0f0f");
  p(2 + armS, 21 - armS, 2, 3, "#fce1ca");

  // Правая рука — кибернетический протез
  const rax = shootAnimationTimer > 0 ? 15 : 13 - armS;
  const ray = shootAnimationTimer > 0 ? 8  : 12 - armS;
  p(rax,     ray,     3,  9, "#0f0f0f");          // плечо/предплечье
  p(rax + 1, ray + 2, 1,  1, "#39FF14", true);    // верхний чип (зелёный)
  p(rax + 1, ray + 4, 2,  2, "#00aaff", true);    // центральная панель (синяя)
  p(rax,     ray + 6, 3,  1, "#222238");           // разделитель
  p(rax + 1, ray + 7, 2,  2, "#00aaff", true);    // нижняя панель
  p(rax,     ray + 9, 3,  2, "#1a1a2e");           // кисть-протез
  p(rax + 1, ray + 9, 1,  2, "#39FF14", true);    // светящийся шов

  // Голова
  p(6, 4, 7, 7, "#fce1ca"); p(7, 3, 2, 1, "#fce1ca");
  p(8, 7, 1, 1, "#fff"); p(9, 7, 1, 1, "#000");
  p(11, 7, 1, 1, "#fff"); p(12, 7, 1, 1, "#000");
  p(5, 1, 9, 4, "#000"); p(5, 4, 2, 4, "#000"); p(11, 4, 3, 2, "#000"); p(8, 0, 4, 1, "#000");
  // Полоска на шлеме — зелёная (активны) / красная (заблокированы)
  p(6, 1, 7, 1, abilitiesUnlocked ? "#39FF14" : "#DF2531", true);

  ctx.restore();
}

// =========================================================
// UI — HP-BAR
// =========================================================
function drawUI() {
  const barW = 220, barH = 16, bx = 20;
  const shX  = hpShakeTimer > 0 ? (Math.random() - 0.5) * 5 : 0;
  const by   = 88;
  if (hpShakeTimer > 0) hpShakeTimer--;

  // Фон
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(bx + shX - 2, by - 2, barW + 4, barH + 4);

  // Заливка
  const ratio = Math.max(0, playerHP / maxHP);
  const hg    = ctx.createLinearGradient(bx + shX, by, bx + shX + barW, by);
  if (ratio > 0.55) { hg.addColorStop(0, "#1aff1a"); hg.addColorStop(1, "#39FF14"); }
  else if (ratio > 0.28) { hg.addColorStop(0, "#ff9900"); hg.addColorStop(1, "#ffdd00"); }
  else { hg.addColorStop(0, "#DF2531"); hg.addColorStop(1, "#ff7070"); }
  ctx.fillStyle = hg;
  ctx.fillRect(bx + shX, by, ratio * barW, barH);

  // Блик
  if (ratio > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    ctx.fillRect(bx + shX, by, ratio * barW, barH / 2);
  }

  // Рамка
  const gc = ratio > 0.28 ? "#39FF14" : "#DF2531";
  ctx.shadowBlur  = hpFlashTimer > 0 ? 22 : 7;
  ctx.shadowColor = hpFlashTimer > 0 ? "#ffffff" : gc;
  ctx.strokeStyle = gc; ctx.lineWidth = 1.5;
  ctx.strokeRect(bx + shX, by, barW, barH);
  ctx.shadowBlur = 0;
  if (hpFlashTimer > 0) hpFlashTimer--;

  // Деления
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  for (let i = 1; i < 10; i++) ctx.fillRect(bx + shX + (barW / 10) * i, by, 1, barH);

  // Текст
  ctx.fillStyle = "#F8F8F8"; ctx.font = "bold 12px 'Courier New'";
  ctx.fillText(`HP ${Math.max(0, playerHP)} / ${maxHP}`, bx + barW + 12, by + 12);

  // Способности
  if (abilitiesUnlocked) {
    ctx.fillStyle = "#00aaff"; ctx.font = "11px 'Courier New'";
    ctx.fillText("◈ ABILITIES ONLINE", bx, 122);
    if (rewindCooldown > 0) {
      ctx.fillStyle = "#DF2531";
      ctx.fillText(`⏎ REWIND: ${Math.ceil(rewindCooldown / 60)}s`, bx, 138);
    } else {
      ctx.shadowBlur = 5; ctx.shadowColor = "#39FF14";
      ctx.fillStyle  = "#39FF14";
      ctx.fillText("⏎ REWIND READY  [R]", bx, 138);
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = "#F8F8F8"; ctx.fillText("◉ LMB — SHOOT", bx, 154);
  } else {
    ctx.fillStyle = "#DF2531"; ctx.font = "11px 'Courier New'";
    ctx.fillText("◈ ABILITIES: LOCKED", bx, 122);
    ctx.fillStyle = "#555"; ctx.fillText("  die to unlock", bx, 138);
  }

  // HP дрона
  if (drone) {
    const dx = canvas.width - 165;
    ctx.fillStyle = "#00aaff"; ctx.font = "11px 'Courier New'";
    ctx.fillText("DRONE:", dx, 25);
    ctx.fillStyle = "#111"; ctx.fillRect(dx, 28, 110, 8);
    ctx.fillStyle = "#DF2531"; ctx.fillRect(dx, 28, (drone.health / 50) * 110, 8);
    ctx.strokeStyle = "#DF2531"; ctx.lineWidth = 1;
    ctx.strokeRect(dx, 28, 110, 8);
  }
}

// =========================================================
// ГЛИТЧ
// =========================================================
function applyGlitch() {
  if (deathGlitch > 0) {
    ctx.globalCompositeOperation = "lighten";
    ctx.fillStyle = `rgba(223,37,49,${deathGlitch / 45})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    deathGlitch--;
  }
  if (deathEffect > 0) {
    ctx.fillStyle = `rgba(255,255,255,${deathEffect / 72})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    deathEffect--;
  }
}

// =========================================================
// МИР
// =========================================================
function drawWorld() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0,    "#01010e");
  sky.addColorStop(0.45, "#020212");
  sky.addColorStop(0.75, "#060616");
  sky.addColorStop(1,    "#000000");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStars();
  drawClouds();
  drawBuildings();
  drawFog();
  drawRain();
  drawParticles();

  // Земля
  const gY = canvas.height - 80;
  const gg = ctx.createLinearGradient(0, gY, 0, canvas.height);
  gg.addColorStop(0, "#040410"); gg.addColorStop(1, "#00000a");
  ctx.fillStyle = gg; ctx.fillRect(0, gY, canvas.width, 80);

  ctx.shadowBlur = 22; ctx.shadowColor = "#39FF14";
  ctx.fillStyle  = "#39FF14"; ctx.fillRect(0, gY, canvas.width, 3);
  ctx.shadowColor = "#00aaff";
  ctx.fillStyle   = "#00aaff"; ctx.fillRect(0, gY + 7, canvas.width, 2);
  // Отражение
  ctx.shadowBlur = 0;
  ctx.save();
  ctx.globalAlpha = 0.07 + Math.sin(Date.now() * 0.002) * 0.02;
  ctx.fillStyle   = "#39FF14"; ctx.fillRect(0, gY + 14, canvas.width, 1);
  ctx.restore();
}

// =========================================================
// ОБНОВЛЕНИЕ ИГРЫ
// =========================================================
function updateGame(now) {
  if (!gameStarted || paused) return;

  // ── Движение: ПК (клавиатура) ──
  if (platform === "pc") {
    if (keys["d"] || keys["ArrowRight"]) { player.x += walkSpeed; player.facing =  1; }
    if (keys["a"] || keys["ArrowLeft"])  { player.x -= walkSpeed; player.facing = -1; }
    if ((keys[" "] || keys["w"] || keys["ArrowUp"]) && !player.isJumping) {
      player.vy = jumpPower; player.isJumping = true;
    }
    if ((keys["r"] || keys["R"]) && abilitiesUnlocked && rewindCooldown <= 0 && !deathSequenceActive) performRewind(false);
  }

  // ── Движение: мобильное ──
  if (platform === "mobile") {
    if (mobileLeft)  { player.x -= walkSpeed; player.facing = -1; }
    if (mobileRight) { player.x += walkSpeed; player.facing =  1; }
    if (mobileJump && !player.isJumping) {
      player.vy = jumpPower; player.isJumping = true;
      mobileJump = false;   // одиночный прыжок — сбрасываем
    }
    if (mobileRewind && abilitiesUnlocked && rewindCooldown <= 0 && !deathSequenceActive) {
      performRewind(false);
      mobileRewind = false;
    }
  }

  applyRooftopCollision();
  if (player.x < 0) player.x = 0;
  cameraX += (player.x - cameraX - canvas.width / 3) * 0.1;
  updateRooftops(); updateParticles();
  if (!drone && player.x > 2000) spawnDrone();
  if (drone) updateDrone();
  updateBullets(); updateExplosionParticles();
  if (rewindCooldown > 0) rewindCooldown--;
  saveState(); updateWalkCycle(now); updateShootAnimation();
  if (player.spawnAlpha < 1) player.spawnAlpha = Math.min(1, player.spawnAlpha + 0.035);
}

// =========================================================
// ОТРИСОВКА КАДРА
// =========================================================
function draw() {
  if (phase === "matrix") { drawMatrix(); return; }
  drawWorld();
  drawRooftops();
  drawDrone();
  drawBullets();
  drawExplosionParticles();
  ctx.globalAlpha = player.spawnAlpha;
  drawHero(player.x, player.y, player.facing);
  ctx.globalAlpha = 1;
  drawUI();
  drawRewindEffect();
  applyGlitch();
  if (gameStarted) {
    ctx.fillStyle = "#39FF14"; ctx.font = "12px 'Courier New'";
    ctx.fillText(">> TEMPORAL_SYNC: 98%",                20, 30);
    ctx.fillText(">> LOCATION: KAIROS_CITY_UPPER_LEVEL", 20, 50);
    if (platform === "pc") {
      ctx.fillStyle = "rgba(57,255,20,0.45)";
      ctx.fillText("A/D · W/SPACE · R=REWIND · LMB=SHOOT", 20, 68);
    }
  }
}

// =========================================================
// ГРОМКОСТЬ
// =========================================================
function updateVolume() {
  if (!gameMusic) return;
  const step = 0.03;
  if (currentVolume < targetVolume) currentVolume = Math.min(currentVolume + step, targetVolume);
  else if (currentVolume > targetVolume) currentVolume = Math.max(currentVolume - step, targetVolume);
  try { gameMusic.volume = muted ? 0 : currentVolume; } catch(e) {}
}

// =========================================================
// ПЕРЕЗАПУСК
// =========================================================
function restartGame() {
  phase = "start"; startTime = null; gameStarted = false; musicStarted = false;
  paused = false; cameraX = 0; targetVolume = 1; currentVolume = 1;
  try { gameMusic.pause(); gameMusic.currentTime = 0; } catch(e) {}
  try { glitchSound.pause(); glitchSound.currentTime = 0; } catch(e) {}
  player = { x:300, y:-200, w:40, h:80, vy:0, facing:1, isJumping:false, spawnAlpha:0, walkCycle:0, fallSoundPlayed:false };
  playerHP = 20;
  abilitiesUnlocked = false; rewindCooldown = 0;
  drone = null; droneKilled = false; playerBullets = []; enemyBullets = [];
  history = []; frameCounter = 0; explosionParticles = [];
  deathSequenceActive = false; deathEffect = 0; deathGlitch = 0; rewindEffect = 0;
  hpShakeTimer = 0; hpFlashTimer = 0;
  keys = {};
  mobileLeft = false; mobileRight = false; mobileJump = false; mobileRewind = false;
  // Сброс платформы — снова покажем экран выбора
  platform = null;
  cleanupMobileControls();
  pauseMenu.style.display    = "none";
  platformScreen.style.display = "none";
  introText.style.display    = "block";
  introText.style.opacity    = "0";
  introText.textContent      = "";
  introText.classList.remove("glitch-text");
  startScreen.style.display  = "flex";
  initRooftops();
}

function backToMainMenu() { restartGame(); startScreen.style.display = "flex"; pauseMenu.style.display = "none"; }
function openSettings()   { settingsModal.style.display = "flex"; }
function closeSettings()  {
  settingsModal.style.display = "none";
  targetVolume = parseFloat(document.getElementById("musicVolume").value);
  sfxVolume    = parseFloat(document.getElementById("sfxVolume").value);
  muted        = document.getElementById("muteCheckbox").checked;
  saveSettings();
}

// =========================================================
// ЭКРАН ВЫБОРА ПЛАТФОРМЫ
// =========================================================
const platformScreen = document.getElementById("platformScreen");

function showPlatformSelect() {
  startScreen.style.display  = "none";
  platformScreen.style.display = "flex";
}

function choosePlatform(chosen) {
  platform = chosen;
  platformScreen.style.display = "none";
  // Запускаем интро
  startTime = performance.now();
  initRooftops();
  playSFX(glitchSound);
  if (platform === "mobile") setupMobileControls();
}

// =========================================================
// МОБИЛЬНЫЕ КНОПКИ
// Позиционирование — чисто CSS (bottom/left/right через переменные).
// JS только создаёт элементы и вешает обработчики.
// =========================================================
let mobBtns = [];

function getMobSize() {
  // Должен совпадать с CSS --mob-size: clamp(60px, 13vw, 88px)
  return Math.max(60, Math.min(88, window.innerWidth * 0.13));
}

function setupMobileControls() {
  cleanupMobileControls();

  // Стрельба: touchstart на canvas (не на кнопки)
  canvas.addEventListener("touchstart", onCanvasTouchShoot, { passive: false });

  // Определения кнопок — позиция задаётся через id + CSS
  const defs = [
    { id:"mob-left",   label:"◀", down: () => { mobileLeft  = true;  }, up: () => { mobileLeft  = false; } },
    { id:"mob-right",  label:"▶", down: () => { mobileRight = true;  }, up: () => { mobileRight = false; } },
    { id:"mob-jump",   label:"▲", down: () => { mobileJump  = true;  }, up: () => {} },
    { id:"mob-rewind", label:"⏎", down: () => { mobileRewind = true; }, up: () => {} },
  ];

  defs.forEach(def => {
    const el = document.createElement("div");
    el.id          = def.id;
    el.className   = "mob-btn";
    el.textContent = def.label;
    // Никакого inline-стиля позиционирования — всё в CSS

    const onDown = (e) => {
      e.preventDefault();
      if (!gameStarted || paused) return;
      el.classList.add("pressed");
      def.down();
    };
    const onUp = (e) => {
      e.preventDefault();
      el.classList.remove("pressed");
      def.up();
    };

    el.addEventListener("touchstart",  onDown, { passive: false });
    el.addEventListener("touchend",    onUp,   { passive: false });
    el.addEventListener("touchcancel", onUp,   { passive: false });
    el.addEventListener("mousedown",   onDown);
    el.addEventListener("mouseup",     onUp);
    el.addEventListener("mouseleave",  onUp);

    document.body.appendChild(el);
    mobBtns.push(el);
  });
}

function cleanupMobileControls() {
  canvas.removeEventListener("touchstart", onCanvasTouchShoot);
  mobBtns.forEach(el => el.remove());
  mobBtns = [];
  mobileLeft = false; mobileRight = false; mobileJump = false; mobileRewind = false;
}

// Стрельба по касанию canvas (только если не попали на кнопку)
function onCanvasTouchShoot(e) {
  e.preventDefault();
  if (!gameStarted || paused || !abilitiesUnlocked) return;
  const touch = e.changedTouches[0];
  // Проверяем — не попали ли на одну из виртуальных кнопок
  for (const btn of mobBtns) {
    const r = btn.getBoundingClientRect();
    if (touch.clientX >= r.left && touch.clientX <= r.right &&
        touch.clientY >= r.top  && touch.clientY <= r.bottom) return;
  }
  const rect = canvas.getBoundingClientRect();
  const mx = (touch.clientX - rect.left) * (canvas.width  / rect.width)  + cameraX;
  const my = (touch.clientY - rect.top)  * (canvas.height / rect.height);
  const cx = player.x + player.w / 2, cy = player.y + player.h / 2;
  const len = Math.hypot(mx - cx, my - cy);
  if (len > 0) {
    playerBullets.push({ x: cx, y: cy, vx: (mx - cx) / len * 10, vy: (my - cy) / len * 10 });
    playSFX(shootSound);
    startShootAnimation();
  }
}

// =========================================================
// КНОПКИ ИНТЕРФЕЙСА
// =========================================================
document.getElementById("settingsStartBtn").onclick = openSettings;
document.getElementById("settingsBtn").onclick      = openSettings;
document.getElementById("closeSettings").onclick    = closeSettings;

// INITIALIZE — показываем выбор платформы
document.getElementById("startBtn").onclick = () => showPlatformSelect();

// Выбор платформы
document.getElementById("pcBtn").onclick     = () => choosePlatform("pc");
document.getElementById("mobileBtn").onclick = () => choosePlatform("mobile");

document.getElementById("resumeBtn").onclick   = () => {
  if (gameStarted) { paused = false; targetVolume = 1; pauseMenu.style.display = "none"; }
};
document.getElementById("restartBtn").onclick  = restartGame;
document.getElementById("mainMenuBtn").onclick = backToMainMenu;

// =========================================================
// ГЛАВНЫЙ ЦИКЛ
// =========================================================
function loop(time) {
  updateIntro(time);
  updateGame(time);
  draw();
  updateVolume();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener("resize", () => { if (phase === "matrix") initMatrix(); });
