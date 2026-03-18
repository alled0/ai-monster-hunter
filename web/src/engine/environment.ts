import { type Monster, type Agent, type GameState, type Direction, DIRS, VEC, key, dangerTiles, rotateCW } from './types';

function randInt(n: number) { return Math.floor(Math.random() * n); }
function randDir(): Direction { return DIRS[randInt(4)]; }

export function createEnvironment(R: number, C: number, nMonsters: number): GameState {
  const agentR = randInt(R), agentC = randInt(C);
  const agent: Agent = { r: agentR, c: agentC, level: 1, kills: 0, alive: true };
  const monsters = new Map<string, Monster>();

  let level = 1;
  for (let i = 0; i < nMonsters; i++) {
    let r, c;
    do { r = randInt(R); c = randInt(C); }
    while ((r === agentR && c === agentC) || monsters.has(key(r, c)));
    monsters.set(key(r, c), { r, c, level, facing: randDir(), turns: 0 });
    level++;
  }

  const dt = dangerTiles(monsters, R, C);
  return { R, C, turn: 0, agent, monsters, dangerTiles: dt, done: false, won: false };
}

export function stepMonsters(state: GameState): void {
  for (const m of state.monsters.values()) {
    m.turns++;
    if (m.turns % 2 === 0) m.facing = rotateCW(m.facing);
  }
}

export function checkMonsterAttack(state: GameState): void {
  for (const m of state.monsters.values()) {
    const [dr, dc] = VEC[m.facing];
    if (m.r + dr === state.agent.r && m.c + dc === state.agent.c) {
      state.agent.alive = false;
      break;
    }
  }
}

export function executeAction(
  state: GameState,
  action: 'MOVE' | 'ATTACK' | 'WAIT',
  arg: Direction | string | null
): void {
  if (action === 'MOVE' && arg) {
    const [dr, dc] = VEC[arg as Direction];
    state.agent.r += dr;
    state.agent.c += dc;
  } else if (action === 'ATTACK' && arg) {
    const monster = state.monsters.get(arg as string);
    if (monster) {
      if (state.agent.level >= monster.level) {
        state.monsters.delete(arg as string);
        state.agent.kills++;
        state.agent.level++;
      } else {
        state.agent.alive = false;
      }
    }
  }
}

export function finishStep(state: GameState): void {
  state.dangerTiles = dangerTiles(state.monsters, state.R, state.C);
  if (!state.agent.alive) { state.done = true; state.won = false; }
  else if (state.monsters.size === 0) { state.done = true; state.won = true; }
}
