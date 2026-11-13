// @ts-check

/**
 * Núcleo lógico do jogo Cobrinha Arcade (funções puras e configuração).
 * Separado da interface DOM/Canvas para facilitar ajustes de balanceamento
 * e testes determinísticos.
 */

export const GRID_SIZE = 20;
export const RANKING_STORAGE_KEY = 'cobrinha_vinicius_ranking_v1';
export const LAST_PLAYER_STORAGE_KEY = 'cobrinha_vinicius_last_player_v1';
export const MAX_RANKING_ENTRIES = 15;
export const LEVEL_TRANSITION_MS = 1350;

/** @type {Record<'UP' | 'DOWN' | 'LEFT' | 'RIGHT', { x: number, y: number }>} */
export const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

/**
 * Auxiliar para construir blocos retangulares de obstáculos de forma legível.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {Array<{ x: number, y: number }>}
 */
function rectObstacles(x1, y1, x2, y2) {
  const cells = [];
  for (let x = x1; x <= x2; x += 1) {
    for (let y = y1; y <= y2; y += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * Remove coordenadas duplicadas caso dois blocos se sobreponham.
 * @param {Array<{ x: number, y: number }>} list
 * @returns {Array<{ x: number, y: number }>}
 */
function dedupeCoords(list) {
  const seen = new Set();
  return list.filter((cell) => {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * CONFIGURAÇÃO CENTRALIZADA DOS NÍVEIS
 * Ajuste facilmente velocidade (speedMs), meta de pontos (targetScore),
 * pontos por fruta (pointsPerFood) e o desenho de obstáculos de cada fase.
 *
 * Observação de segurança: a faixa central de nascimento (y = 10, x = 4..12)
 * permanece sempre livre em todos os níveis para evitar colisões injustas.
 */
export const LEVELS_CONFIG = [
  {
    level: 1,
    name: 'Clareira Inicial',
    description: 'Arena livre para aquecer os reflexos.',
    speedMs: 155,
    targetScore: 50,
    pointsPerFood: 10,
    obstacles: [],
  },
  {
    level: 2,
    name: 'Pedras do Bosque',
    description: 'Pilares nos quatro cantos aumentam o ritmo.',
    speedMs: 132,
    targetScore: 120,
    pointsPerFood: 10,
    obstacles: dedupeCoords([
      ...rectObstacles(3, 3, 5, 3),
      ...rectObstacles(3, 3, 3, 5),
      ...rectObstacles(14, 3, 16, 3),
      ...rectObstacles(16, 3, 16, 5),
      ...rectObstacles(3, 16, 5, 16),
      ...rectObstacles(3, 14, 3, 16),
      ...rectObstacles(14, 16, 16, 16),
      ...rectObstacles(16, 14, 16, 16),
    ]),
  },
  {
    level: 3,
    name: 'Corredor de Pedra',
    description: 'Muralhas paralelas exigem curvas precisas.',
    speedMs: 112,
    targetScore: 210,
    pointsPerFood: 15,
    obstacles: dedupeCoords([
      ...rectObstacles(5, 5, 14, 5),
      ...rectObstacles(5, 14, 14, 14),
      ...rectObstacles(1, 9, 1, 11),
      ...rectObstacles(18, 9, 18, 11),
    ]),
  },
  {
    level: 4,
    name: 'Labirinto Antigo',
    description: 'Câmaras internas com passagens estreitas e alta velocidade.',
    speedMs: 94,
    targetScore: 330,
    pointsPerFood: 20,
    obstacles: dedupeCoords([
      // Quatro quinas internas formando uma câmara com saídas norte/sul/leste/oeste
      ...rectObstacles(4, 4, 7, 4),
      ...rectObstacles(4, 4, 4, 7),
      ...rectObstacles(12, 4, 15, 4),
      ...rectObstacles(15, 4, 15, 7),
      ...rectObstacles(4, 15, 7, 15),
      ...rectObstacles(4, 12, 4, 15),
      ...rectObstacles(12, 15, 15, 15),
      ...rectObstacles(15, 12, 15, 15),
      // Blocos sentinelas laterais
      ...rectObstacles(9, 2, 10, 2),
      ...rectObstacles(9, 17, 10, 17),
    ]),
  },
  {
    level: 5,
    name: 'Fortaleza Jade',
    description: 'Velocidade máxima da campanha com corredores fechados.',
    speedMs: 78,
    targetScore: 480,
    pointsPerFood: 25,
    obstacles: dedupeCoords([
      ...rectObstacles(3, 3, 7, 3),
      ...rectObstacles(3, 3, 3, 7),
      ...rectObstacles(12, 3, 16, 3),
      ...rectObstacles(16, 3, 16, 7),
      ...rectObstacles(3, 16, 7, 16),
      ...rectObstacles(3, 12, 3, 16),
      ...rectObstacles(12, 16, 16, 16),
      ...rectObstacles(16, 12, 16, 16),
      // Pilares internos simétricos deixando a linha y=10 (x=4..12) livre
      ...rectObstacles(7, 7, 12, 7),
      ...rectObstacles(7, 12, 12, 12),
    ]),
  },
  {
    level: 6,
    name: 'Modo Infinito',
    description: 'Campanha concluída! Busque o topo do ranking sem limite de pontos.',
    speedMs: 68,
    targetScore: Infinity,
    pointsPerFood: 30,
    obstacles: dedupeCoords([
      ...rectObstacles(3, 3, 7, 3),
      ...rectObstacles(3, 3, 3, 7),
      ...rectObstacles(12, 3, 16, 3),
      ...rectObstacles(16, 3, 16, 7),
      ...rectObstacles(3, 16, 7, 16),
      ...rectObstacles(3, 12, 3, 16),
      ...rectObstacles(12, 16, 16, 16),
      ...rectObstacles(16, 12, 16, 16),
      ...rectObstacles(7, 7, 12, 7),
      ...rectObstacles(7, 12, 12, 12),
    ]),
  },
];

/**
 * Retorna a configuração de um nível a partir do número da fase (1-indexed).
 * @param {number} levelNumber
 */
export function getLevelConfig(levelNumber) {
  const found = LEVELS_CONFIG.find((lvl) => lvl.level === levelNumber);
  return found || LEVELS_CONFIG[LEVELS_CONFIG.length - 1];
}

/**
 * Calcula o nível correspondente à pontuação atual do jogador.
 * A progressão acontece automaticamente quando score >= targetScore do nível atual.
 * @param {number} score
 */
export function getLevelForScore(score) {
  for (let i = 0; i < LEVELS_CONFIG.length; i += 1) {
    const cfg = LEVELS_CONFIG[i];
    if (score < cfg.targetScore) {
      return cfg;
    }
  }
  return LEVELS_CONFIG[LEVELS_CONFIG.length - 1];
}

/**
 * Calcula o intervalo efetivo (ms) da cobra.
 * No Modo Infinito (nível 6), acelera suavemente a cada 120 pontos extras.
 * @param {number} levelNumber
 * @param {number} score
 */
export function getEffectiveSpeedMs(levelNumber, score) {
  const cfg = getLevelConfig(levelNumber);
  if (levelNumber < 6) {
    return cfg.speedMs;
  }
  const previousTarget = LEVELS_CONFIG[LEVELS_CONFIG.length - 2].targetScore;
  const extraSteps = Math.max(0, Math.floor((score - previousTarget) / 120));
  return Math.max(52, cfg.speedMs - extraSteps * 3);
}

/**
 * Cria a posição inicial segura da cobra no centro da arena, apontando para a direita.
 * @returns {Array<{ x: number, y: number }>}
 */
export function createInitialSnake() {
  return [
    { x: 5, y: 10 },
    { x: 4, y: 10 },
    { x: 3, y: 10 },
  ];
}

/**
 * Verifica se duas direções são opostas (impedindo giro de 180° sobre o próprio corpo).
 * @param {'UP' | 'DOWN' | 'LEFT' | 'RIGHT'} dirA
 * @param {'UP' | 'DOWN' | 'LEFT' | 'RIGHT'} dirB
 */
export function isOppositeDirection(dirA, dirB) {
  const a = DIRECTIONS[dirA];
  const b = DIRECTIONS[dirB];
  if (!a || !b) return false;
  return a.x + b.x === 0 && a.y + b.y === 0;
}

/**
 * Enfileira uma nova direção respeitando o último comando planejado
 * para evitar reversão instantânea em dois toques rápidos no mesmo tick.
 * @param {Array<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>} queue
 * @param {'UP' | 'DOWN' | 'LEFT' | 'RIGHT'} currentDirection
 * @param {'UP' | 'DOWN' | 'LEFT' | 'RIGHT'} requestedDirection
 */
export function enqueueDirection(queue, currentDirection, requestedDirection) {
  if (!DIRECTIONS[requestedDirection]) return queue;
  if (queue.length >= 2) return queue;
  const referenceDir = queue.length > 0 ? queue[queue.length - 1] : currentDirection;
  if (requestedDirection === referenceDir || isOppositeDirection(referenceDir, requestedDirection)) {
    return queue;
  }
  return [...queue, requestedDirection];
}

/**
 * Gera comida em uma célula livre (fora do corpo da cobra, obstáculos e comida extra).
 * @param {Array<{ x: number, y: number }>} snake
 * @param {Array<{ x: number, y: number }>} obstacles
 * @param {number} [gridSize]
 * @param {() => number} [rng]
 * @param {Array<{ x: number, y: number }>} [excluded]
 * @returns {{ x: number, y: number } | null}
 */
export function spawnFood(snake, obstacles, gridSize = GRID_SIZE, rng = Math.random, excluded = []) {
  const occupied = new Set();
  for (const seg of snake) occupied.add(`${seg.x},${seg.y}`);
  for (const obs of obstacles) occupied.add(`${obs.x},${obs.y}`);
  for (const ex of excluded) {
    if (ex) occupied.add(`${ex.x},${ex.y}`);
  }

  const freeCells = [];
  for (let x = 0; x < gridSize; x += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      if (!occupied.has(`${x},${y}`)) {
        freeCells.push({ x, y });
      }
    }
  }

  if (freeCells.length === 0) return null;
  const index = Math.floor(rng() * freeCells.length);
  return freeCells[Math.min(index, freeCells.length - 1)];
}

/**
 * Cria o estado inicial completo de uma partida.
 * @param {string} playerName
 * @param {() => number} [rng]
 */
export function createInitialGameState(playerName, rng = Math.random) {
  const levelConfig = getLevelConfig(1);
  const snake = createInitialSnake();
  const food = spawnFood(snake, levelConfig.obstacles, GRID_SIZE, rng);
  return {
    playerName,
    score: 0,
    foodsEaten: 0,
    level: 1,
    snake,
    direction: /** @type {'UP' | 'DOWN' | 'LEFT' | 'RIGHT'} */ ('RIGHT'),
    directionQueue: /** @type {Array<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>} */ ([]),
    food,
    bonusFood: /** @type {{ x: number, y: number, ticksLeft: number } | null} */ (null),
    transitionMsLeft: 0,
    status: /** @type {'playing' | 'gameover'} */ ('playing'),
    deathReason: /** @type {'wall' | 'obstacle' | 'self' | null} */ (null),
  };
}

/**
 * Executa um passo (tick) da simulação do jogo:
 * 1) Consome próxima direção válida da fila
 * 2) Calcula nova cabeça e verifica colisões (paredes, obstáculos e próprio corpo)
 * 3) Verifica coleta de comida comum/bônus, crescimento e progressão de nível
 *
 * @param {ReturnType<typeof createInitialGameState>} state
 * @param {() => number} [rng]
 */
export function stepGame(state, rng = Math.random) {
  if (state.status !== 'playing') {
    return { nextState: state, events: [] };
  }

  const events = [];
  const currentConfig = getLevelConfig(state.level);
  const queue = [...state.directionQueue];
  const nextDirection = queue.shift() || state.direction;
  const delta = DIRECTIONS[nextDirection];
  const head = state.snake[0];
  const nextHead = { x: head.x + delta.x, y: head.y + delta.y };

  // 1. Colisão com as bordas da arena
  if (
    nextHead.x < 0 ||
    nextHead.x >= GRID_SIZE ||
    nextHead.y < 0 ||
    nextHead.y >= GRID_SIZE
  ) {
    events.push('COLLISION_WALL');
    return {
      nextState: {
        ...state,
        direction: nextDirection,
        directionQueue: queue,
        status: /** @type {'gameover'} */ ('gameover'),
        deathReason: /** @type {'wall'} */ ('wall'),
      },
      events,
    };
  }

  // 2. Colisão com obstáculos da fase
  const hitObstacle = currentConfig.obstacles.some(
    (obs) => obs.x === nextHead.x && obs.y === nextHead.y
  );
  if (hitObstacle) {
    events.push('COLLISION_OBSTACLE');
    return {
      nextState: {
        ...state,
        direction: nextDirection,
        directionQueue: queue,
        status: /** @type {'gameover'} */ ('gameover'),
        deathReason: /** @type {'obstacle'} */ ('obstacle'),
      },
      events,
    };
  }

  // Verifica se vai comer comida neste passo (para saber se a cauda se move)
  const ateFood = Boolean(state.food && nextHead.x === state.food.x && nextHead.y === state.food.y);
  const ateBonus = Boolean(
    state.bonusFood && nextHead.x === state.bonusFood.x && nextHead.y === state.bonusFood.y
  );
  const willGrow = ateFood || ateBonus;

  // 3. Colisão com o próprio corpo (ignora a ponta da cauda se a cobra não crescer neste tick)
  const bodyToCheck = willGrow ? state.snake : state.snake.slice(0, -1);
  const hitSelf = bodyToCheck.some((seg) => seg.x === nextHead.x && seg.y === nextHead.y);
  if (hitSelf) {
    events.push('COLLISION_SELF');
    return {
      nextState: {
        ...state,
        direction: nextDirection,
        directionQueue: queue,
        status: /** @type {'gameover'} */ ('gameover'),
        deathReason: /** @type {'self'} */ ('self'),
      },
      events,
    };
  }

  // 4. Movimento válido: insere nova cabeça e remove cauda se não cresceu
  const movedSnake = [nextHead, ...state.snake];
  if (!willGrow) {
    movedSnake.pop();
  }

  let nextScore = state.score;
  let nextFoodsEaten = state.foodsEaten;
  let nextFood = state.food;
  let nextBonusFood = state.bonusFood
    ? { ...state.bonusFood, ticksLeft: state.bonusFood.ticksLeft - 1 }
    : null;

  if (nextBonusFood && nextBonusFood.ticksLeft <= 0) {
    nextBonusFood = null;
  }

  if (ateFood) {
    nextScore += currentConfig.pointsPerFood;
    nextFoodsEaten += 1;
    events.push('ATE_FOOD');
  }

  if (ateBonus) {
    nextScore += currentConfig.pointsPerFood * 3;
    nextBonusFood = null;
    events.push('ATE_BONUS');
  }

  // 5. Progressão de nível ao atingir a meta de pontos
  const targetLevelConfig = getLevelForScore(nextScore);
  if (targetLevelConfig.level > state.level) {
    events.push('LEVEL_UP');
    // Reposiciona a cobra na faixa segura da nova fase (mantendo um tamanho equilibrado)
    const safeLength = Math.min(movedSnake.length, 4);
    const resetSnake = [];
    for (let i = 0; i < safeLength; i += 1) {
      resetSnake.push({ x: 5 - i, y: 10 });
    }
    const freshFood = spawnFood(resetSnake, targetLevelConfig.obstacles, GRID_SIZE, rng);
    return {
      nextState: {
        ...state,
        score: nextScore,
        foodsEaten: nextFoodsEaten,
        level: targetLevelConfig.level,
        snake: resetSnake,
        direction: /** @type {'RIGHT'} */ ('RIGHT'),
        directionQueue: /** @type {Array<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>} */ ([]),
        food: freshFood,
        bonusFood: null,
        transitionMsLeft: LEVEL_TRANSITION_MS,
      },
      events,
    };
  }

  // Gera nova comida comum caso tenha sido coletada
  if (ateFood) {
    const excluded = nextBonusFood ? [nextBonusFood] : [];
    nextFood = spawnFood(movedSnake, currentConfig.obstacles, GRID_SIZE, rng, excluded);

    // A cada 4 frutas a partir do Nível 2, surge uma fruta dourada temporária
    if (state.level >= 2 && nextFoodsEaten % 4 === 0 && !nextBonusFood) {
      const bonusPos = spawnFood(
        movedSnake,
        currentConfig.obstacles,
        GRID_SIZE,
        rng,
        nextFood ? [nextFood] : []
      );
      if (bonusPos) {
        nextBonusFood = { ...bonusPos, ticksLeft: 36 };
      }
    }
  }

  return {
    nextState: {
      ...state,
      score: nextScore,
      foodsEaten: nextFoodsEaten,
      snake: movedSnake,
      direction: nextDirection,
      directionQueue: queue,
      food: nextFood,
      bonusFood: nextBonusFood,
    },
    events,
  };
}

/**
 * Normaliza e valida o nome digitado pelo jogador antes de iniciar a partida.
 * @param {string} rawName
 */
export function validatePlayerName(rawName) {
  const normalized = String(rawName || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  if (normalized.length < 2) {
    return {
      valid: false,
      normalized,
      error: 'Digite seu nome (mínimo de 2 caracteres) para jogar e entrar no ranking.',
    };
  }
  return { valid: true, normalized, error: '' };
}

/**
 * Ordena entradas do ranking: maior pontuação primeiro, depois maior nível e data mais antiga.
 * @param {Array<{ id: string, name: string, score: number, level: number, levelName: string, dateISO: string }>} entries
 */
export function sortRanking(entries) {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.level !== a.level) return b.level - a.level;
    return new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime();
  });
}

/**
 * Carrega o ranking persistido no localStorage com tratamento seguro contra dados corrompidos.
 * @param {Pick<Storage, 'getItem'> | null | undefined} storage
 */
export function loadRanking(storage) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RANKING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const validEntries = parsed.filter(
      (item) =>
        item &&
        typeof item.name === 'string' &&
        item.name.trim().length > 0 &&
        typeof item.score === 'number' &&
        Number.isFinite(item.score) &&
        typeof item.level === 'number'
    );
    return sortRanking(validEntries).slice(0, MAX_RANKING_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * Registra a pontuação de uma partida no ranking e persiste no localStorage.
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null | undefined} storage
 * @param {{ name: string, score: number, level: number, levelName?: string, dateISO?: string }} match
 */
export function recordMatchScore(storage, match) {
  const check = validatePlayerName(match.name);
  if (!check.valid) {
    return { ranking: loadRanking(storage), entry: null };
  }

  const levelCfg = getLevelConfig(match.level);
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: check.normalized,
    score: Math.max(0, Math.round(match.score)),
    level: match.level,
    levelName: match.levelName || levelCfg.name,
    dateISO: match.dateISO || new Date().toISOString(),
  };

  const existing = loadRanking(storage);
  const updated = sortRanking([...existing, entry]).slice(0, MAX_RANKING_ENTRIES);

  if (storage) {
    try {
      storage.setItem(RANKING_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignora erro caso armazenamento privado esteja cheio ou bloqueado
    }
  }

  return { ranking: updated, entry };
}

/**
 * Limpa o ranking salvo no localStorage.
 * @param {Pick<Storage, 'removeItem'> | null | undefined} storage
 */
export function clearRanking(storage) {
  if (!storage) return [];
  try {
    storage.removeItem(RANKING_STORAGE_KEY);
  } catch {
    // Ignora caso storage não esteja disponível
  }
  return [];
}
