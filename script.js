// @ts-check

import {
  DIRECTIONS,
  GRID_SIZE,
  LAST_PLAYER_STORAGE_KEY,
  LEVELS_CONFIG,
  LEVEL_TRANSITION_MS,
  clearRanking,
  createInitialGameState,
  enqueueDirection,
  getEffectiveSpeedMs,
  getLevelConfig,
  loadRanking,
  recordMatchScore,
  stepGame,
  validatePlayerName,
} from './game-logic.js';

/** @typedef {'title' | 'playing' | 'paused' | 'gameover'} AppState */

const MAX_PARTICLES = 40;
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* -------------------------------------------------------------------------- */
/* Referências de DOM                                                         */
/* -------------------------------------------------------------------------- */

const bodyEl = document.body;
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const arenaFrame = /** @type {HTMLElement} */ (document.getElementById('arena-frame'));

const hudPlayerEl = /** @type {HTMLElement} */ (document.getElementById('hud-player-name'));
const hudLevelEl = /** @type {HTMLElement} */ (document.getElementById('hud-level'));
const hudLevelNameEl = /** @type {HTMLElement} */ (document.getElementById('hud-level-name'));
const hudScoreEl = /** @type {HTMLElement} */ (document.getElementById('hud-score'));
const hudTargetEl = /** @type {HTMLElement} */ (document.getElementById('hud-target'));
const hudSpeedEl = /** @type {HTMLElement} */ (document.getElementById('hud-speed'));
const hudProgressFillEl = /** @type {HTMLElement} */ (document.getElementById('hud-progress-fill'));

const levelBannerEl = /** @type {HTMLElement} */ (document.getElementById('level-banner'));
const levelBannerKickerEl = /** @type {HTMLElement} */ (document.getElementById('level-banner-kicker'));
const levelBannerTitleEl = /** @type {HTMLElement} */ (document.getElementById('level-banner-title'));
const levelBannerDescEl = /** @type {HTMLElement} */ (document.getElementById('level-banner-desc'));

const screenTitleEl = /** @type {HTMLElement} */ (document.getElementById('screen-title'));
const screenPausedEl = /** @type {HTMLElement} */ (document.getElementById('screen-paused'));
const screenGameOverEl = /** @type {HTMLElement} */ (document.getElementById('screen-gameover'));

const startForm = /** @type {HTMLFormElement} */ (document.getElementById('start-form'));
const playerNameInput = /** @type {HTMLInputElement} */ (document.getElementById('player-name-input'));
const nameErrorEl = /** @type {HTMLElement} */ (document.getElementById('name-error'));
const levelsPreviewListEl = /** @type {HTMLElement} */ (document.getElementById('levels-preview-list'));

const titleRankingContainerEl = /** @type {HTMLElement} */ (document.getElementById('title-ranking-container'));
const gameoverRankingContainerEl = /** @type {HTMLElement} */ (document.getElementById('gameover-ranking-container'));
const gameoverPlayerLabelEl = /** @type {HTMLElement} */ (document.getElementById('gameover-player-label'));

const btnClearRankingTitle = /** @type {HTMLButtonElement} */ (document.getElementById('btn-clear-ranking-title'));
const confirmClearTitleEl = /** @type {HTMLElement} */ (document.getElementById('confirm-clear-title'));
const btnConfirmClearYes = /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-clear-yes'));
const btnConfirmClearNo = /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-clear-no'));

const btnToggleDpad = /** @type {HTMLButtonElement} */ (document.getElementById('btn-toggle-dpad'));
const touchControlsEl = /** @type {HTMLElement} */ (document.getElementById('touch-controls'));
const btnMute = /** @type {HTMLButtonElement} */ (document.getElementById('btn-mute'));
const iconSoundOn = /** @type {SVGElement} */ (/** @type {unknown} */ (document.getElementById('icon-sound-on')));
const iconSoundOff = /** @type {SVGElement} */ (/** @type {unknown} */ (document.getElementById('icon-sound-off')));
const btnPause = /** @type {HTMLButtonElement} */ (document.getElementById('btn-pause'));
const btnRestartHud = /** @type {HTMLButtonElement} */ (document.getElementById('btn-restart-hud'));

const btnResume = /** @type {HTMLButtonElement} */ (document.getElementById('btn-resume'));
const btnRestartPause = /** @type {HTMLButtonElement} */ (document.getElementById('btn-restart-pause'));
const btnBackTitlePause = /** @type {HTMLButtonElement} */ (document.getElementById('btn-back-title-pause'));

const gameoverReasonEl = /** @type {HTMLElement} */ (document.getElementById('gameover-reason'));
const finalScoreEl = /** @type {HTMLElement} */ (document.getElementById('final-score'));
const finalLevelEl = /** @type {HTMLElement} */ (document.getElementById('final-level'));
const finalBestEl = /** @type {HTMLElement} */ (document.getElementById('final-best'));
const btnPlayAgain = /** @type {HTMLButtonElement} */ (document.getElementById('btn-play-again'));
const btnChangePlayer = /** @type {HTMLButtonElement} */ (document.getElementById('btn-change-player'));

/* -------------------------------------------------------------------------- */
/* Efeitos Sonoros Sintéticos (Web Audio API sem arquivos externos)           */
/* -------------------------------------------------------------------------- */

class SoundEngine {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.muted = false;
  }

  ensureContext() {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * @param {number} freq
   * @param {number} durationSec
   * @param {OscillatorType} type
   * @param {number} volume
   * @param {number} [delaySec]
   */
  playTone(freq, durationSec, type = 'sine', volume = 0.08, delaySec = 0) {
    const audio = this.ensureContext();
    if (!audio) return;
    const now = audio.currentTime + delaySec;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  /** @param {number} level */
  playEat(level) {
    const pitchBoost = 1 + Math.min(level - 1, 5) * 0.06;
    this.playTone(520 * pitchBoost, 0.09, 'triangle', 0.09);
    this.playTone(720 * pitchBoost, 0.08, 'sine', 0.06, 0.04);
  }

  playBonus() {
    this.playTone(660, 0.09, 'triangle', 0.09, 0);
    this.playTone(880, 0.09, 'triangle', 0.09, 0.06);
    this.playTone(1100, 0.14, 'sine', 0.08, 0.12);
  }

  playLevelUp() {
    this.playTone(440, 0.11, 'triangle', 0.09, 0);
    this.playTone(554.37, 0.11, 'triangle', 0.09, 0.09);
    this.playTone(659.25, 0.18, 'triangle', 0.1, 0.18);
  }

  playCrash() {
    this.playTone(150, 0.18, 'sawtooth', 0.09, 0);
    this.playTone(95, 0.24, 'triangle', 0.1, 0.07);
  }
}

const sound = new SoundEngine();

/* -------------------------------------------------------------------------- */
/* Buffer circular pré-alocado de partículas (zero GC durante o loop)         */
/* -------------------------------------------------------------------------- */

const particles = Array.from({ length: MAX_PARTICLES }, () => ({
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  life: 0,
  maxLife: 1,
  size: 3,
  color: '#22C55E',
}));
let particleCursor = 0;

/**
 * @param {number} cellX
 * @param {number} cellY
 * @param {string} color
 * @param {number} count
 */
function emitParticles(cellX, cellY, color, count) {
  if (prefersReducedMotion) return;
  const cx = cellX + 0.5;
  const cy = cellY + 0.5;
  for (let i = 0; i < count; i += 1) {
    const p = particles[particleCursor];
    particleCursor = (particleCursor + 1) % MAX_PARTICLES;
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 1.8 + Math.random() * 4.2;
    p.active = true;
    p.x = cx;
    p.y = cy;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.life = 0.38 + Math.random() * 0.22;
    p.maxLife = p.life;
    p.size = 2.5 + Math.random() * 2.5;
    p.color = color;
  }
}

/** @param {number} dtSec */
function updateParticles(dtSec) {
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    const p = particles[i];
    if (!p.active) continue;
    p.life -= dtSec;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    p.vx *= 0.92;
    p.vy *= 0.92;
  }
}

function clearParticles() {
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    particles[i].active = false;
  }
}

/* -------------------------------------------------------------------------- */
/* Estado da Aplicação                                                        */
/* -------------------------------------------------------------------------- */

/** @type {AppState} */
let appState = 'title';
let activePlayerName = '';
let gameState = createInitialGameState('Jogador');
let tickAccumulatorMs = 0;
let lastFrameTime = performance.now();
let hitFlashMs = 0;
let pendingGameOverTimer = 0;
let lastRecordedEntryId = null;
let canvasPixelSize = 560;
let demoTickAccumulatorMs = 0;
let demoSnake = [
  { x: 9, y: 10 },
  { x: 8, y: 10 },
  { x: 7, y: 10 },
  { x: 6, y: 10 },
  { x: 5, y: 10 },
];
let demoDir = /** @type {'UP' | 'DOWN' | 'LEFT' | 'RIGHT'} */ ('RIGHT');

/* -------------------------------------------------------------------------- */
/* Renderização de UI (Ranking, Níveis e HUD)                                 */
/* -------------------------------------------------------------------------- */

function getSafeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function renderLevelsPreview() {
  levelsPreviewListEl.innerHTML = '';
  const previewLevels = LEVELS_CONFIG.slice(0, 5);
  for (const cfg of previewLevels) {
    const li = document.createElement('li');
    li.className = 'level-row';

    const num = document.createElement('span');
    num.className = 'level-num';
    num.textContent = `Nível ${cfg.level}`;

    const name = document.createElement('span');
    name.className = 'level-row-name';
    name.textContent = cfg.name;

    const meta = document.createElement('span');
    meta.className = 'level-row-meta';
    const obstacleLabel = cfg.obstacles.length > 0 ? 'Obstáculos' : 'Livre';
    meta.textContent = `Meta ${cfg.targetScore} pts · ${obstacleLabel}`;

    li.append(num, name, meta);
    levelsPreviewListEl.appendChild(li);
  }
}

/**
 * @param {HTMLElement} container
 * @param {string | null} highlightId
 */
function renderRankingList(container, highlightId = null) {
  const entries = loadRanking(getSafeStorage());
  container.innerHTML = '';

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'ranking-empty';
    empty.textContent = 'Nenhuma pontuação registrada ainda. Seja o primeiro a entrar no ranking!';
    container.appendChild(empty);
    return;
  }

  const table = document.createElement('table');
  table.className = 'ranking-table';
  table.setAttribute('aria-label', 'Tabela de classificação');

  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr><th>#</th><th>Jogador</th><th class="num">Nível</th><th class="num">Pontos</th></tr>';

  const tbody = document.createElement('tbody');
  entries.slice(0, 10).forEach((entry, idx) => {
    const tr = document.createElement('tr');
    if (highlightId && entry.id === highlightId) {
      tr.className = 'is-current-run';
    }

    const tdPos = document.createElement('td');
    tdPos.className = 'ranking-pos tabular-nums';
    tdPos.textContent = `${idx + 1}`;

    const tdName = document.createElement('td');
    tdName.className = 'ranking-name';
    tdName.textContent = entry.name;

    const tdLevel = document.createElement('td');
    tdLevel.className = 'num tabular-nums';
    tdLevel.textContent = `${entry.level}`;

    const tdScore = document.createElement('td');
    tdScore.className = 'num tabular-nums';
    tdScore.textContent = `${entry.score}`;

    tr.append(tdPos, tdName, tdLevel, tdScore);
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  container.appendChild(table);
}

function syncHud() {
  const levelCfg = getLevelConfig(gameState.level);
  const speedMs = getEffectiveSpeedMs(gameState.level, gameState.score);

  hudPlayerEl.textContent = gameState.playerName;
  hudLevelEl.textContent = `${gameState.level}`;
  hudLevelNameEl.textContent = levelCfg.name;
  hudScoreEl.textContent = `${gameState.score}`;
  hudSpeedEl.textContent = `${speedMs} ms`;

  if (Number.isFinite(levelCfg.targetScore)) {
    const prevTarget =
      gameState.level > 1 ? getLevelConfig(gameState.level - 1).targetScore : 0;
    const span = Math.max(1, levelCfg.targetScore - prevTarget);
    const pct = Math.min(100, Math.max(0, ((gameState.score - prevTarget) / span) * 100));
    hudTargetEl.textContent = `Meta: ${levelCfg.targetScore}`;
    hudProgressFillEl.style.width = `${pct.toFixed(1)}%`;
  } else {
    hudTargetEl.textContent = 'Modo Infinito';
    hudProgressFillEl.style.width = '100%';
  }
}

/** @param {number} levelNumber */
function showLevelBanner(levelNumber) {
  const cfg = getLevelConfig(levelNumber);
  levelBannerKickerEl.textContent = `Nível ${cfg.level}`;
  levelBannerTitleEl.textContent = cfg.name;
  levelBannerDescEl.textContent = cfg.description;
  levelBannerEl.classList.remove('hidden');
}

function hideLevelBanner() {
  levelBannerEl.classList.add('hidden');
}

/** @param {AppState} nextState */
function setAppState(nextState) {
  appState = nextState;
  bodyEl.dataset.state = nextState;

  screenTitleEl.classList.toggle('hidden', nextState !== 'title');
  screenPausedEl.classList.toggle('hidden', nextState !== 'paused');
  screenGameOverEl.classList.toggle('hidden', nextState !== 'gameover');

  if (nextState === 'title') {
    confirmClearTitleEl.classList.add('hidden');
    renderRankingList(titleRankingContainerEl);
  }
}

/* -------------------------------------------------------------------------- */
/* Controle de Partida (Início, Pausa, Reinício, Fim de Jogo)                 */
/* -------------------------------------------------------------------------- */

/** @param {string} playerName */
function beginMatch(playerName) {
  if (pendingGameOverTimer) {
    window.clearTimeout(pendingGameOverTimer);
    pendingGameOverTimer = 0;
  }

  activePlayerName = playerName;
  gameState = createInitialGameState(playerName);
  tickAccumulatorMs = 0;
  hitFlashMs = 0;
  lastRecordedEntryId = null;
  clearParticles();
  arenaFrame.classList.remove('shake');

  const storage = getSafeStorage();
  if (storage) {
    try {
      storage.setItem(LAST_PLAYER_STORAGE_KEY, playerName);
    } catch {
      // Ignora erro de escrita no storage
    }
  }

  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  setAppState('playing');
  syncHud();
  showLevelBanner(1);
  gameState.transitionMsLeft = LEVEL_TRANSITION_MS;
}

function togglePause() {
  if (appState === 'playing') {
    setAppState('paused');
  } else if (appState === 'paused') {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    lastFrameTime = performance.now();
    setAppState('playing');
  }
}

function finishMatchToGameOver() {
  const storage = getSafeStorage();
  const { ranking, entry } = recordMatchScore(storage, {
    name: gameState.playerName,
    score: gameState.score,
    level: gameState.level,
  });
  lastRecordedEntryId = entry ? entry.id : null;

  const reasonMap = {
    wall: 'Você atingiu a borda da arena.',
    obstacle: 'Você colidiu com um bloco de pedra.',
    self: 'Você colidiu com o próprio corpo.',
  };
  gameoverReasonEl.textContent =
    (gameState.deathReason && reasonMap[gameState.deathReason]) || 'Fim de partida.';

  const personalBest = ranking
    .filter((r) => r.name.toLowerCase() === gameState.playerName.toLowerCase())
    .reduce((max, r) => Math.max(max, r.score), gameState.score);

  finalScoreEl.textContent = `${gameState.score}`;
  finalLevelEl.textContent = `${gameState.level}`;
  finalBestEl.textContent = `${personalBest}`;
  gameoverPlayerLabelEl.textContent = gameState.playerName;

  renderRankingList(gameoverRankingContainerEl, lastRecordedEntryId);
  setAppState('gameover');
}

/** @param {'UP' | 'DOWN' | 'LEFT' | 'RIGHT'} dir */
function handleDirectionInput(dir) {
  if (appState !== 'playing') return;
  gameState.directionQueue = enqueueDirection(
    gameState.directionQueue,
    gameState.direction,
    dir
  );
  // Permite iniciar imediatamente ao pressionar uma tecla durante o banner de introdução
  if (gameState.transitionMsLeft > 250) {
    gameState.transitionMsLeft = 120;
  }
}

/* -------------------------------------------------------------------------- */
/* Renderização Canvas 2D                                                     */
/* -------------------------------------------------------------------------- */

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const side = Math.max(240, Math.floor(rect.width));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = side * dpr;
  canvas.height = side * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvasPixelSize = side;
}

/**
 * Desenha retângulo arredondado reutilizável.
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function drawRoundedRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Renderiza o tabuleiro, obstáculos, comidas, cobra e partículas.
 * @param {number} nowMs
 */
function renderBoard(nowMs) {
  const size = canvasPixelSize;
  const cell = size / GRID_SIZE;

  // 1. Fundo em padrão sutil de tabuleiro
  ctx.fillStyle = '#0F1B15';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#13221B';
  for (let gx = 0; gx < GRID_SIZE; gx += 1) {
    for (let gy = 0; gy < GRID_SIZE; gy += 1) {
      if ((gx + gy) % 2 === 1) {
        ctx.fillRect(gx * cell, gy * cell, cell, cell);
      }
    }
  }

  // Modo ambiente quando está na tela inicial
  if (appState === 'title') {
    drawSnakeSegments(demoSnake, demoDir, cell, false, nowMs);
    return;
  }

  const levelCfg = getLevelConfig(gameState.level);

  // 2. Obstáculos da fase atual
  for (const obs of levelCfg.obstacles) {
    const ox = obs.x * cell + 1.5;
    const oy = obs.y * cell + 1.5;
    const ow = cell - 3;

    ctx.fillStyle = '#2F4038';
    drawRoundedRect(ox, oy, ow, ow, 5);
    ctx.fill();

    // Chanfro superior para leitura tátil
    ctx.strokeStyle = 'rgba(210, 235, 220, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox + 3, oy + ow - 3);
    ctx.lineTo(ox + 3, oy + 3);
    ctx.lineTo(ox + ow - 3, oy + 3);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.moveTo(ox + ow - 3, oy + 3);
    ctx.lineTo(ox + ow - 3, oy + ow - 3);
    ctx.lineTo(ox + 3, oy + ow - 3);
    ctx.stroke();
  }

  // 3. Fruta comum
  if (gameState.food) {
    const pulse = prefersReducedMotion ? 1 : 1 + Math.sin(nowMs * 0.006) * 0.06;
    const cx = (gameState.food.x + 0.5) * cell;
    const cy = (gameState.food.y + 0.5) * cell;
    const r = cell * 0.36 * pulse;

    ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Brilho e folha
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#4ADE80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.85);
    ctx.quadraticCurveTo(cx + r * 0.45, cy - r * 1.35, cx + r * 0.7, cy - r * 0.95);
    ctx.stroke();
  }

  // 4. Fruta bônus dourada (Nível 2+)
  if (gameState.bonusFood) {
    const cx = (gameState.bonusFood.x + 0.5) * cell;
    const cy = (gameState.bonusFood.y + 0.5) * cell;
    const r = cell * 0.38;
    const ratio = Math.max(0, gameState.bonusFood.ticksLeft / 36);

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();

    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.arc(cx - r * 0.26, cy - r * 0.28, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Cobra
  drawSnakeSegments(
    gameState.snake,
    gameState.direction,
    cell,
    hitFlashMs > 0,
    nowMs
  );

  // 6. Partículas ativas
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    const p = particles[i];
    if (!p.active) continue;
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * cell, p.y * cell, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Desenha os segmentos da cobra com cabeça destacada e olhos direcionais.
 * @param {Array<{ x: number, y: number }>} snake
 * @param {'UP' | 'DOWN' | 'LEFT' | 'RIGHT'} direction
 * @param {number} cell
 * @param {boolean} isHitFlash
 * @param {number} nowMs
 */
function drawSnakeSegments(snake, direction, cell, isHitFlash, nowMs) {
  for (let i = snake.length - 1; i >= 0; i -= 1) {
    const seg = snake[i];
    const isHead = i === 0;
    const pad = isHead ? 1.2 : 2.1;
    const x = seg.x * cell + pad;
    const y = seg.y * cell + pad;
    const w = cell - pad * 2;
    const radius = isHead ? cell * 0.34 : cell * 0.28;

    if (isHitFlash) {
      ctx.fillStyle = isHead ? '#FCA5A5' : '#EF4444';
    } else if (isHead) {
      ctx.fillStyle = '#4ADE80';
    } else {
      const ratio = i / Math.max(1, snake.length - 1);
      const green = Math.round(197 - ratio * 65);
      ctx.fillStyle = `rgb(24, ${green}, 82)`;
    }

    drawRoundedRect(x, y, w, w, radius);
    ctx.fill();

    if (isHead) {
      drawSnakeHeadDetails(seg, direction, cell, nowMs);
    }
  }
}

/**
 * Desenha olhos direcionais e língua discreta na cabeça da cobra.
 * @param {{ x: number, y: number }} head
 * @param {'UP' | 'DOWN' | 'LEFT' | 'RIGHT'} direction
 * @param {number} cell
 * @param {number} nowMs
 */
function drawSnakeHeadDetails(head, direction, cell, nowMs) {
  const cx = (head.x + 0.5) * cell;
  const cy = (head.y + 0.5) * cell;
  const dir = DIRECTIONS[direction];
  const perpX = -dir.y;
  const perpY = dir.x;

  const forwardOffset = cell * 0.16;
  const sideOffset = cell * 0.18;
  const eyeRadius = Math.max(2, cell * 0.1);

  const eye1X = cx + dir.x * forwardOffset + perpX * sideOffset;
  const eye1Y = cy + dir.y * forwardOffset + perpY * sideOffset;
  const eye2X = cx + dir.x * forwardOffset - perpX * sideOffset;
  const eye2Y = cy + dir.y * forwardOffset - perpY * sideOffset;

  ctx.fillStyle = '#07190E';
  ctx.beginPath();
  ctx.arc(eye1X, eye1Y, eyeRadius, 0, Math.PI * 2);
  ctx.arc(eye2X, eye2Y, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(eye1X + dir.x * 0.8, eye1Y + dir.y * 0.8, eyeRadius * 0.4, 0, Math.PI * 2);
  ctx.arc(eye2X + dir.x * 0.8, eye2Y + dir.y * 0.8, eyeRadius * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Língua bífida discreta piscando periodicamente
  if (!prefersReducedMotion && Math.sin(nowMs * 0.008) > 0.65) {
    const startX = cx + dir.x * (cell * 0.44);
    const startY = cy + dir.y * (cell * 0.44);
    const tipX = cx + dir.x * (cell * 0.64);
    const tipY = cy + dir.y * (cell * 0.64);
    ctx.strokeStyle = '#FB7185';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
}

/* -------------------------------------------------------------------------- */
/* Loop Principal (60 FPS desacoplado do DOM)                                 */
/* -------------------------------------------------------------------------- */

/** @param {number} dtMs */
function advanceDemoSnake(dtMs) {
  if (prefersReducedMotion) return;
  demoTickAccumulatorMs += dtMs;
  if (demoTickAccumulatorMs < 190) return;
  demoTickAccumulatorMs = 0;

  const head = demoSnake[0];
  if (head.x >= 15 && demoDir === 'RIGHT') demoDir = 'DOWN';
  else if (head.y >= 14 && demoDir === 'DOWN') demoDir = 'LEFT';
  else if (head.x <= 4 && demoDir === 'LEFT') demoDir = 'UP';
  else if (head.y <= 5 && demoDir === 'UP') demoDir = 'RIGHT';

  const d = DIRECTIONS[demoDir];
  demoSnake.unshift({ x: head.x + d.x, y: head.y + d.y });
  demoSnake.pop();
}

/** @param {number} now */
function gameLoop(now) {
  const rawDtMs = now - lastFrameTime;
  lastFrameTime = now;
  // Limita delta para evitar saltos após troca de aba
  const dtMs = Math.min(Math.max(rawDtMs, 0), 50);

  if (appState === 'title') {
    advanceDemoSnake(dtMs);
  } else if (appState === 'playing') {
    updateParticles(dtMs / 1000);

    if (hitFlashMs > 0) {
      hitFlashMs = Math.max(0, hitFlashMs - dtMs);
    }

    if (gameState.status === 'playing') {
      if (gameState.transitionMsLeft > 0) {
        gameState.transitionMsLeft = Math.max(0, gameState.transitionMsLeft - dtMs);
        if (gameState.transitionMsLeft === 0) {
          hideLevelBanner();
        }
      } else {
        tickAccumulatorMs += dtMs;
        const speedMs = getEffectiveSpeedMs(gameState.level, gameState.score);

        while (tickAccumulatorMs >= speedMs && gameState.status === 'playing') {
          tickAccumulatorMs -= speedMs;
          const prevFood = gameState.food;
          const prevBonus = gameState.bonusFood;
          const { nextState, events } = stepGame(gameState);
          gameState = nextState;

          if (events.includes('ATE_FOOD')) {
            sound.playEat(gameState.level);
            if (prevFood) emitParticles(prevFood.x, prevFood.y, '#EF4444', 8);
          }

          if (events.includes('ATE_BONUS')) {
            sound.playBonus();
            if (prevBonus) emitParticles(prevBonus.x, prevBonus.y, '#F59E0B', 14);
          }

          if (events.includes('LEVEL_UP')) {
            sound.playLevelUp();
            const head = gameState.snake[0];
            emitParticles(head.x, head.y, '#4ADE80', 18);
            showLevelBanner(gameState.level);
            tickAccumulatorMs = 0;
            syncHud();
            break;
          }

          if (
            events.includes('COLLISION_WALL') ||
            events.includes('COLLISION_OBSTACLE') ||
            events.includes('COLLISION_SELF')
          ) {
            sound.playCrash();
            hitFlashMs = 420;
            const head = gameState.snake[0];
            emitParticles(head.x, head.y, '#EF4444', 18);
            arenaFrame.classList.remove('shake');
            void arenaFrame.offsetWidth;
            arenaFrame.classList.add('shake');
            hideLevelBanner();
            pendingGameOverTimer = window.setTimeout(() => {
              pendingGameOverTimer = 0;
              finishMatchToGameOver();
            }, 430);
          }

          syncHud();
        }
      }
    }
  }

  renderBoard(now);
  window.requestAnimationFrame(gameLoop);
}

/* -------------------------------------------------------------------------- */
/* Eventos de Entrada (Formulário, Teclado, Toque/Swipe e D-Pad)              */
/* -------------------------------------------------------------------------- */

startForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const validation = validatePlayerName(playerNameInput.value);
  if (!validation.valid) {
    nameErrorEl.textContent = validation.error;
    nameErrorEl.classList.remove('hidden');
    playerNameInput.focus();
    return;
  }
  nameErrorEl.classList.add('hidden');
  beginMatch(validation.normalized);
});

playerNameInput.addEventListener('input', () => {
  if (!nameErrorEl.classList.contains('hidden')) {
    nameErrorEl.classList.add('hidden');
  }
});

// Botões da HUD e Modais
btnToggleDpad.addEventListener('click', () => {
  const isVisible = touchControlsEl.classList.toggle('is-visible');
  btnToggleDpad.setAttribute('aria-pressed', String(isVisible));
  btnToggleDpad.blur();
});

btnMute.addEventListener('click', () => {
  sound.muted = !sound.muted;
  btnMute.setAttribute('aria-pressed', String(sound.muted));
  iconSoundOn.classList.toggle('hidden', sound.muted);
  iconSoundOff.classList.toggle('hidden', !sound.muted);
  btnMute.blur();
});

btnPause.addEventListener('click', () => {
  togglePause();
  btnPause.blur();
});

btnRestartHud.addEventListener('click', () => {
  if (activePlayerName) {
    beginMatch(activePlayerName);
  }
  btnRestartHud.blur();
});

btnResume.addEventListener('click', () => togglePause());

btnRestartPause.addEventListener('click', () => {
  beginMatch(activePlayerName);
});

btnBackTitlePause.addEventListener('click', () => {
  hideLevelBanner();
  setAppState('title');
  playerNameInput.focus();
});

btnPlayAgain.addEventListener('click', () => {
  beginMatch(activePlayerName);
});

btnChangePlayer.addEventListener('click', () => {
  hideLevelBanner();
  setAppState('title');
  playerNameInput.focus();
  playerNameInput.select();
});

// Limpar ranking com confirmação em linha (sem window.confirm)
btnClearRankingTitle.addEventListener('click', () => {
  confirmClearTitleEl.classList.remove('hidden');
});

btnConfirmClearNo.addEventListener('click', () => {
  confirmClearTitleEl.classList.add('hidden');
});

btnConfirmClearYes.addEventListener('click', () => {
  clearRanking(getSafeStorage());
  confirmClearTitleEl.classList.add('hidden');
  renderRankingList(titleRankingContainerEl);
});

// Teclado (Setas + WASD + Atalhos)
window.addEventListener('keydown', (e) => {
  const key = e.key;
  const activeTag = document.activeElement?.tagName;
  const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

  if (appState === 'title') {
    if (!isTyping && (key === 'Enter' || key === ' ')) {
      e.preventDefault();
      startForm.requestSubmit();
    }
    return;
  }

  if (appState === 'gameover') {
    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      beginMatch(activePlayerName);
    }
    return;
  }

  if (key === 'Escape' || key === 'p' || key === 'P' || key === ' ') {
    e.preventDefault();
    togglePause();
    return;
  }

  if (key === 'm' || key === 'M') {
    e.preventDefault();
    btnMute.click();
    return;
  }

  if (key === 'r' || key === 'R') {
    e.preventDefault();
    if (activePlayerName) beginMatch(activePlayerName);
    return;
  }

  /** @type {Record<string, 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>} */
  const keyMap = {
    ArrowUp: 'UP',
    w: 'UP',
    W: 'UP',
    ArrowDown: 'DOWN',
    s: 'DOWN',
    S: 'DOWN',
    ArrowLeft: 'LEFT',
    a: 'LEFT',
    A: 'LEFT',
    ArrowRight: 'RIGHT',
    d: 'RIGHT',
    D: 'RIGHT',
  };

  const mappedDir = keyMap[key];
  if (mappedDir) {
    e.preventDefault();
    handleDirectionInput(mappedDir);
  }
});

// Controles na tela (D-pad) com resposta imediata ao toque/ponteiro
const dpadButtons = document.querySelectorAll('.dpad-btn[data-dir]');
dpadButtons.forEach((btn) => {
  let pointerHandled = false;
  const dir = /** @type {'UP' | 'DOWN' | 'LEFT' | 'RIGHT'} */ (btn.getAttribute('data-dir'));

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointerHandled = true;
    btn.classList.add('is-active');
    handleDirectionInput(dir);
  });

  const clearActive = () => {
    btn.classList.remove('is-active');
  };
  btn.addEventListener('pointerup', clearActive);
  btn.addEventListener('pointercancel', clearActive);
  btn.addEventListener('pointerleave', clearActive);

  btn.addEventListener('click', (e) => {
    if (pointerHandled) {
      pointerHandled = false;
      return;
    }
    e.preventDefault();
    handleDirectionInput(dir);
  });
});

// Gestos de deslize (Swipe) diretamente sobre o canvas no celular
let touchStartX = 0;
let touchStartY = 0;
let trackingTouch = false;

canvas.addEventListener(
  'touchstart',
  (e) => {
    if (appState !== 'playing' || e.touches.length === 0) return;
    trackingTouch = true;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  },
  { passive: true }
);

canvas.addEventListener(
  'touchmove',
  (e) => {
    if (!trackingTouch || appState !== 'playing' || e.touches.length === 0) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    const threshold = 24;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    e.preventDefault();
    if (Math.abs(dx) > Math.abs(dy)) {
      handleDirectionInput(dx > 0 ? 'RIGHT' : 'LEFT');
    } else {
      handleDirectionInput(dy > 0 ? 'DOWN' : 'UP');
    }

    // Reposiciona âncora para permitir curvas contínuas sem tirar o dedo
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  },
  { passive: false }
);

canvas.addEventListener(
  'touchend',
  () => {
    trackingTouch = false;
  },
  { passive: true }
);

/* -------------------------------------------------------------------------- */
/* Inicialização                                                              */
/* -------------------------------------------------------------------------- */

function init() {
  renderLevelsPreview();
  resizeCanvas();

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(arenaFrame);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }

  const storage = getSafeStorage();
  if (storage) {
    const savedName = storage.getItem(LAST_PLAYER_STORAGE_KEY);
    if (savedName) {
      playerNameInput.value = savedName;
    }
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('autostart') === '1') {
    const paramName = validatePlayerName(params.get('player') || 'Jogador Demo');
    beginMatch(paramName.valid ? paramName.normalized : 'Jogador Demo');
  } else {
    setAppState('title');
  }

  lastFrameTime = performance.now();
  window.requestAnimationFrame(gameLoop);
}

init();
