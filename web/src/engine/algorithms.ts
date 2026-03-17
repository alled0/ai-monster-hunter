import { type GameState, type Direction, type AlgorithmId, DIRS, VEC, key, dangerTiles } from './types';
import { stepMonsters, checkMonsterAttack, executeAction, finishStep } from './environment';

// ─── BFS helpers ────────────────────────────────────────────────────────────

function bfs(
  sr: number, sc: number,
  goalR: number, goalC: number,
  R: number, C: number,
  blocked: Set<string>,
  avoid: Set<string>
): Direction[] {
  const queue: Array<{ r: number; c: number; path: Direction[] }> = [{ r: sr, c: sc, path: [] }];
  const visited = new Set<string>([key(sr, sc)]);

  while (queue.length) {
    const { r, c, path } = queue.shift()!;
    if (r === goalR && c === goalC) return path;
    for (const d of DIRS) {
      const [dr, dc] = VEC[d];
      const nr = r + dr, nc = c + dc;
      const k = key(nr, nc);
      if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
      if (visited.has(k) || blocked.has(k) || avoid.has(k)) continue;
      visited.add(k);
      queue.push({ r: nr, c: nc, path: [...path, d] });
    }
  }
  return [];
}

// ─── A* helper ──────────────────────────────────────────────────────────────

function astar(
  sr: number, sc: number,
  goalR: number, goalC: number,
  R: number, C: number,
  blocked: Set<string>,
  avoid: Set<string>
): Direction[] {
  const h = (r: number, c: number) => Math.abs(r - goalR) + Math.abs(c - goalC);

  type Node = { f: number; g: number; r: number; c: number; path: Direction[] };
  const open: Node[] = [{ f: h(sr, sc), g: 0, r: sr, c: sc, path: [] }];
  const gScore = new Map<string, number>([[key(sr, sc), 0]]);
  const visited = new Set<string>();

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    const k = key(cur.r, cur.c);
    if (visited.has(k)) continue;
    visited.add(k);
    if (cur.r === goalR && cur.c === goalC) return cur.path;

    for (const d of DIRS) {
      const [dr, dc] = VEC[d];
      const nr = cur.r + dr, nc = cur.c + dc;
      const nk = key(nr, nc);
      if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
      if (visited.has(nk) || blocked.has(nk) || avoid.has(nk)) continue;
      const ng = cur.g + 1;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        open.push({ f: ng + h(nr, nc), g: ng, r: nr, c: nc, path: [...cur.path, d] });
      }
    }
  }
  return [];
}

// ─── Algorithm 1: SimpleBFS ─────────────────────────────────────────────────
// 8-neighbor perception, random fallback, full-grid-knowledge BFS

function simpleBFSStep(state: GameState): void {
  const { agent, monsters, R, C, dangerTiles: danger } = state;
  const blocked = new Set(monsters.keys());

  // Perceive 8 neighbors (including diagonals)
  const known = new Map<string, typeof monsters extends Map<string, infer V> ? V : never>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const k = key(agent.r + dr, agent.c + dc);
      if (monsters.has(k)) known.set(k, monsters.get(k)!);
    }
  }

  // Find edible targets (level ≤ agent level)
  const edible = [...known.entries()]
    .filter(([, m]) => m.level <= agent.level)
    .map(([k, m]) => ({
      k, m,
      dist: Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c)
    }))
    .sort((a, b) => a.dist - b.dist);

  for (const { k, m, dist } of edible) {
    if (dist === 1) { executeAction(state, 'ATTACK', k); return; }
    // Try adjacent cells around monster
    for (const d of DIRS) {
      const [dr, dc] = VEC[d];
      const ar = m.r + dr, ac = m.c + dc;
      if (ar < 0 || ar >= R || ac < 0 || ac >= C) continue;
      const path = bfs(agent.r, agent.c, ar, ac, R, C, blocked, danger);
      if (path.length) { executeAction(state, 'MOVE', path[0]); return; }
    }
  }

  // Random safe move fallback
  const safeDirs = DIRS.filter(d => {
    const [dr, dc] = VEC[d];
    const nr = agent.r + dr, nc = agent.c + dc;
    const k = key(nr, nc);
    return nr >= 0 && nr < R && nc >= 0 && nc < C && !blocked.has(k) && !danger.has(k);
  });
  if (safeDirs.length) {
    const d = safeDirs[Math.floor(Math.random() * safeDirs.length)];
    executeAction(state, 'MOVE', d);
  } else {
    executeAction(state, 'WAIT', null);
  }
}

// ─── Algorithm 2: BasicBFS ──────────────────────────────────────────────────
// 4-neighbor perception only, frontier exploration, waits if next step dangerous

const basicBFSState = new WeakMap<GameState, { knownFree: Set<string>; knownMonsters: Map<string, any> }>();

function getBasicState(state: GameState) {
  if (!basicBFSState.has(state)) {
    basicBFSState.set(state, {
      knownFree: new Set([key(state.agent.r, state.agent.c)]),
      knownMonsters: new Map(),
    });
  }
  return basicBFSState.get(state)!;
}

function basicBFSStep(state: GameState): void {
  const { agent, monsters, R, C, dangerTiles: danger } = state;
  const local = getBasicState(state);

  // Perceive 4 neighbors
  for (const d of DIRS) {
    const [dr, dc] = VEC[d];
    const nr = agent.r + dr, nc = agent.c + dc;
    if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
    const k = key(nr, nc);
    if (monsters.has(k)) local.knownMonsters.set(k, monsters.get(k));
    else { local.knownFree.add(k); local.knownMonsters.delete(k); }
  }
  // Prune dead monsters
  for (const k of [...local.knownMonsters.keys()]) {
    if (!monsters.has(k)) local.knownMonsters.delete(k);
  }

  const blocked = new Set(local.knownMonsters.keys());

  if (local.knownMonsters.size > 0) {
    const choices = [...local.knownMonsters.entries()]
      .filter(([, m]) => m.level <= agent.level)
      .map(([k, m]) => ({ k, m, dist: Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c) }))
      .sort((a, b) => a.dist - b.dist);

    for (const { k, m } of choices) {
      const [mr, mc] = [m.r, m.c];
      if (Math.abs(mr - agent.r) + Math.abs(mc - agent.c) === 1) {
        executeAction(state, 'ATTACK', k); return;
      }
      for (const d of DIRS) {
        const [dr, dc] = VEC[d];
        const ar = mr + dr, ac = mc + dc;
        if (!local.knownFree.has(key(ar, ac))) continue;
        const path = bfs(agent.r, agent.c, ar, ac, R, C, blocked, danger);
        if (path.length) {
          const [nr, nc] = [agent.r + VEC[path[0]][0], agent.c + VEC[path[0]][1]];
          if (danger.has(key(nr, nc))) { executeAction(state, 'WAIT', null); return; }
          executeAction(state, 'MOVE', path[0]); return;
        }
      }
    }
  }

  // Frontier exploration
  const frontiers: Array<[number, number]> = [];
  for (const fk of local.knownFree) {
    const [fr, fc] = fk.split(',').map(Number);
    for (const d of DIRS) {
      const [dr, dc] = VEC[d];
      const nbk = key(fr + dr, fc + dc);
      if (!local.knownFree.has(nbk) && !local.knownMonsters.has(nbk)) {
        frontiers.push([fr, fc]); break;
      }
    }
  }
  if (frontiers.length) {
    frontiers.sort((a, b) => (Math.abs(a[0] - agent.r) + Math.abs(a[1] - agent.c)) - (Math.abs(b[0] - agent.r) + Math.abs(b[1] - agent.c)));
    const [gr, gc] = frontiers[0];
    const path = bfs(agent.r, agent.c, gr, gc, R, C, blocked, danger);
    if (path.length) {
      const [nr, nc] = [agent.r + VEC[path[0]][0], agent.c + VEC[path[0]][1]];
      if (!danger.has(key(nr, nc))) { executeAction(state, 'MOVE', path[0]); return; }
    }
  }
  executeAction(state, 'WAIT', null);
}

// ─── Algorithm 3: A* Pure ───────────────────────────────────────────────────
// Full knowledge, A* pathfinding, approach from safe (non-facing) side

function astarStep(state: GameState): void {
  const { agent, monsters, R, C, dangerTiles: danger } = state;
  const blocked = new Set(monsters.keys());

  // Perceive 4 neighbors
  const knownMonsters = new Map<string, any>();
  for (const d of DIRS) {
    const [dr, dc] = VEC[d];
    const k = key(agent.r + dr, agent.c + dc);
    if (monsters.has(k)) knownMonsters.set(k, monsters.get(k));
  }

  const targets = [...monsters.entries()]
    .filter(([, m]) => m.level <= agent.level)
    .map(([k, m]) => ({ k, m, dist: Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c) }))
    .sort((a, b) => a.dist - b.dist || b.m.level - a.m.level);

  if (!targets.length) { executeAction(state, 'WAIT', null); return; }

  for (const { k, m } of targets) {
    if (Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c) === 1) {
      executeAction(state, 'ATTACK', k); return;
    }
    // Approach from non-facing side
    const safe: Array<[number, number]> = [];
    for (const d of DIRS) {
      const [dr, dc] = VEC[d];
      const ar = m.r + dr, ac = m.c + dc;
      if (ar >= 0 && ar < R && ac >= 0 && ac < C && !blocked.has(key(ar, ac)) && d !== m.facing) {
        safe.push([ar, ac]);
      }
    }
    for (const [ar, ac] of safe) {
      const path = astar(agent.r, agent.c, ar, ac, R, C, blocked, danger);
      if (path.length) { executeAction(state, 'MOVE', path[0]); return; }
    }
  }
  executeAction(state, 'WAIT', null);
}

// ─── Algorithm 4: A* + Manhattan Explore ───────────────────────────────────
// A* + frontier exploration with partial knowledge

const astarManhattanState = new WeakMap<GameState, { knownFree: Set<string>; knownMonsters: Map<string, any> }>();

function getAMState(state: GameState) {
  if (!astarManhattanState.has(state)) {
    astarManhattanState.set(state, {
      knownFree: new Set([key(state.agent.r, state.agent.c)]),
      knownMonsters: new Map(),
    });
  }
  return astarManhattanState.get(state)!;
}

function astarManhattanStep(state: GameState): void {
  const { agent, monsters, R, C, dangerTiles: danger } = state;
  const local = getAMState(state);

  // Perceive 4 neighbors
  for (const d of DIRS) {
    const [dr, dc] = VEC[d];
    const nr = agent.r + dr, nc = agent.c + dc;
    if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
    const k = key(nr, nc);
    if (monsters.has(k)) local.knownMonsters.set(k, monsters.get(k));
    else { local.knownFree.add(k); local.knownMonsters.delete(k); }
  }
  for (const k of [...local.knownMonsters.keys()]) {
    if (!monsters.has(k)) local.knownMonsters.delete(k);
  }

  const blocked = new Set(local.knownMonsters.keys());
  const viable = [...monsters.entries()]
    .filter(([, m]) => m.level <= agent.level)
    .map(([k, m]) => ({ k, m, dist: Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c) }))
    .sort((a, b) => a.dist - b.dist || b.m.level - a.m.level);

  for (const { k, m } of viable) {
    if (Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c) === 1) {
      executeAction(state, 'ATTACK', k); return;
    }
    const safe: Array<[number, number]> = [];
    for (const d of DIRS) {
      const [dr, dc] = VEC[d];
      const ar = m.r + dr, ac = m.c + dc;
      if (ar >= 0 && ar < R && ac >= 0 && ac < C && !blocked.has(key(ar, ac)) && d !== m.facing) {
        safe.push([ar, ac]);
      }
    }
    for (const [ar, ac] of safe) {
      const path = astar(agent.r, agent.c, ar, ac, R, C, blocked, danger);
      if (path.length) { executeAction(state, 'MOVE', path[0]); return; }
    }
  }

  // Frontier exploration
  const frontiers: Array<[number, number]> = [];
  for (const fk of local.knownFree) {
    const [fr, fc] = fk.split(',').map(Number);
    for (const d of DIRS) {
      const [dr, dc] = VEC[d];
      const nbk = key(fr + dr, fc + dc);
      if (!local.knownFree.has(nbk) && !local.knownMonsters.has(nbk)) {
        frontiers.push([fr, fc]); break;
      }
    }
  }
  if (frontiers.length) {
    frontiers.sort((a, b) => (Math.abs(a[0] - agent.r) + Math.abs(a[1] - agent.c)) - (Math.abs(b[0] - agent.r) + Math.abs(b[1] - agent.c)));
    const [gr, gc] = frontiers[0];
    const path = astar(agent.r, agent.c, gr, gc, R, C, blocked, danger);
    if (path.length) { executeAction(state, 'MOVE', path[0]); return; }
  }
  executeAction(state, 'WAIT', null);
}

// ─── Public step function ───────────────────────────────────────────────────

export function stepGame(state: GameState, algorithmId: AlgorithmId): void {
  if (state.done) return;
  state.turn++;
  stepMonsters(state);
  // Refresh danger tiles AFTER monster rotation so agent plans with current zones
  state.dangerTiles = dangerTiles(state.monsters, state.R, state.C);

  switch (algorithmId) {
    case 'SimpleBFS': simpleBFSStep(state); break;
    case 'BasicBFS': basicBFSStep(state); break;
    case 'AStar': astarStep(state); break;
    case 'AStarManhattan': astarManhattanStep(state); break;
  }

  if (state.agent.alive) checkMonsterAttack(state);
  finishStep(state);
}
