/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRID_SIZE,
  LEVELS_CONFIG,
  createInitialGameState,
  enqueueDirection,
  getLevelForScore,
  getEffectiveSpeedMs,
  loadRanking,
  recordMatchScore,
  clearRanking,
  spawnFood,
  stepGame,
  validatePlayerName,
} from './game-logic.js';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

test('LEVELS_CONFIG possui pelo menos 5 níveis com dificuldade crescente', () => {
  assert.ok(LEVELS_CONFIG.length >= 5);
  for (let i = 1; i < LEVELS_CONFIG.length; i += 1) {
    const prev = LEVELS_CONFIG[i - 1];
    const curr = LEVELS_CONFIG[i];
    assert.ok(curr.speedMs < prev.speedMs, `Nível ${curr.level} deve ser mais rápido que ${prev.level}`);
    assert.ok(curr.targetScore > prev.targetScore, `Meta do nível ${curr.level} deve ser maior`);
  }
});

test('getEffectiveSpeedMs reduz intervalo no Modo Infinito conforme pontos sobem', () => {
  const baseSpeed = getEffectiveSpeedMs(6, 480);
  const fasterSpeed = getEffectiveSpeedMs(6, 840);
  assert.ok(fasterSpeed < baseSpeed);
});

test('enqueueDirection impede reversão imediata de 180 graus', () => {
  let queue = enqueueDirection([], 'RIGHT', 'LEFT');
  assert.deepEqual(queue, []);

  queue = enqueueDirection([], 'RIGHT', 'UP');
  assert.deepEqual(queue, ['UP']);

  // Não pode virar para DOWN logo depois de planejar UP no mesmo tick
  const blocked = enqueueDirection(queue, 'RIGHT', 'DOWN');
  assert.deepEqual(blocked, ['UP']);

  // Pode planejar LEFT depois de UP (curva em L)
  const validCorner = enqueueDirection(queue, 'RIGHT', 'LEFT');
  assert.deepEqual(validCorner, ['UP', 'LEFT']);
});

test('stepGame move a cobra, coleta comida, cresce e avança de nível na meta', () => {
  const state = createInitialGameState('Vinícius', () => 0);
  // Posiciona comida logo à frente da cabeça
  state.food = { x: state.snake[0].x + 1, y: state.snake[0].y };
  state.score = 40; // Meta do nível 1 é 50; +10 ativa Nível 2

  const { nextState, events } = stepGame(state, () => 0);
  assert.ok(events.includes('ATE_FOOD'));
  assert.ok(events.includes('LEVEL_UP'));
  assert.equal(nextState.score, 50);
  assert.equal(nextState.level, 2);
  assert.equal(nextState.status, 'playing');
  assert.ok(nextState.transitionMsLeft > 0);
  assert.equal(getLevelForScore(50).level, 2);
});

test('stepGame detecta colisão com parede, obstáculo e próprio corpo', () => {
  const wallState = createInitialGameState('Ana', () => 0);
  wallState.snake = [{ x: GRID_SIZE - 1, y: 10 }, { x: GRID_SIZE - 2, y: 10 }, { x: GRID_SIZE - 3, y: 10 }];
  wallState.direction = 'RIGHT';
  const wallRes = stepGame(wallState, () => 0);
  assert.equal(wallRes.nextState.status, 'gameover');
  assert.equal(wallRes.nextState.deathReason, 'wall');

  const obsState = createInitialGameState('Ana', () => 0);
  obsState.level = 2;
  const firstObs = LEVELS_CONFIG[1].obstacles[0];
  obsState.snake = [{ x: firstObs.x - 1, y: firstObs.y }, { x: firstObs.x - 2, y: firstObs.y }, { x: firstObs.x - 3, y: firstObs.y }];
  obsState.direction = 'RIGHT';
  const obsRes = stepGame(obsState, () => 0);
  assert.equal(obsRes.nextState.status, 'gameover');
  assert.equal(obsRes.nextState.deathReason, 'obstacle');

  const selfState = createInitialGameState('Ana', () => 0);
  selfState.snake = [
    { x: 5, y: 5 },
    { x: 6, y: 5 },
    { x: 6, y: 6 },
    { x: 5, y: 6 },
    { x: 4, y: 6 },
  ];
  selfState.direction = 'DOWN';
  selfState.food = { x: 0, y: 0 };
  const selfRes = stepGame(selfState, () => 0);
  assert.equal(selfRes.nextState.status, 'gameover');
  assert.equal(selfRes.nextState.deathReason, 'self');
});

test('spawnFood nunca coloca comida sobre a cobra ou obstáculos', () => {
  const obstacles = LEVELS_CONFIG[4].obstacles;
  const snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
  for (let i = 0; i < 30; i += 1) {
    const food = spawnFood(snake, obstacles, GRID_SIZE, () => i / 30);
    assert.ok(food !== null);
    assert.equal(
      obstacles.some((o) => o.x === food!.x && o.y === food!.y),
      false
    );
    assert.equal(
      snake.some((s) => s.x === food!.x && s.y === food!.y),
      false
    );
  }
});

test('validatePlayerName exige nome válido e Ranking persiste ordenado no storage', () => {
  assert.equal(validatePlayerName('   ').valid, false);
  assert.equal(validatePlayerName('A').valid, false);
  assert.equal(validatePlayerName('  Maria   Clara  ').normalized, 'Maria Clara');
  assert.equal(validatePlayerName('  Maria   Clara  ').valid, true);

  const storage = createMemoryStorage();
  recordMatchScore(storage, { name: 'Carlos', score: 80, level: 2, dateISO: '2026-01-01T10:00:00Z' });
  recordMatchScore(storage, { name: 'Ana', score: 210, level: 3, dateISO: '2026-01-01T11:00:00Z' });
  recordMatchScore(storage, { name: 'Pedro', score: 150, level: 3, dateISO: '2026-01-01T12:00:00Z' });

  const loaded = loadRanking(storage);
  assert.equal(loaded.length, 3);
  assert.deepEqual(
    loaded.map((r) => [r.name, r.score]),
    [
      ['Ana', 210],
      ['Pedro', 150],
      ['Carlos', 80],
    ]
  );

  clearRanking(storage);
  assert.equal(loadRanking(storage).length, 0);
});
