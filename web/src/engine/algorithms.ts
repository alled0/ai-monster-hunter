import { type GameState, type Direction, type AlgorithmId, type TraceNode, DIRS, VEC, key, dangerTiles } from './types';
import { stepMonsters, checkMonsterAttack, executeAction, finishStep } from './environment';

// ─── Tracer ──────────────────────────────────────────────────────────────────

class Tracer {
  root: TraceNode;
  private stack: TraceNode[];

  constructor(label: string) {
    this.root = { label, type: 'info', children: [] };
    this.stack = [this.root];
  }

  log(label: string, type: TraceNode['type'] = 'info'): TraceNode {
    const node: TraceNode = { label, type, children: [] };
    this.stack[this.stack.length - 1].children.push(node);
    return node;
  }

  scope<T>(label: string, type: TraceNode['type'], fn: () => T): T {
    const node: TraceNode = { label, type, children: [] };
    this.stack[this.stack.length - 1].children.push(node);
    this.stack.push(node);
    const result = fn();
    this.stack.pop();
    return result;
  }
}

// ─── BFS helper ──────────────────────────────────────────────────────────────

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

// ─── A* helper ───────────────────────────────────────────────────────────────

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

// ─── Algorithm 1: Simple BFS ─────────────────────────────────────────────────

function simpleBFSStep(state: GameState, t: Tracer): void {
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

  const edible = [...known.entries()]
    .filter(([, m]) => m.level <= agent.level)
    .map(([k, m]) => ({ k, m, dist: Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c) }))
    .sort((a, b) => a.dist - b.dist);

  const tooStrong = [...known.entries()].filter(([, m]) => m.level > agent.level);

  t.scope(`Perception — 8-direction scan`, 'info', () => {
    t.log(`Scanned ${known.size} adjacent monster(s)`, 'info');
    edible.forEach(({ m }) => t.log(`Lv${m.level} at (${m.r},${m.c}) — beatable`, 'success'));
    tooStrong.forEach(([, m]) => t.log(`Lv${m.level} at (${m.r},${m.c}) — too strong, skipping`, 'warn'));
  });

  if (edible.length === 0) {
    const safeDirs = DIRS.filter(d => {
      const [dr, dc] = VEC[d];
      const nr = agent.r + dr, nc = agent.c + dc;
      const k = key(nr, nc);
      return nr >= 0 && nr < R && nc >= 0 && nc < C && !blocked.has(k) && !danger.has(k);
    });
    if (safeDirs.length) {
      const d = safeDirs[Math.floor(Math.random() * safeDirs.length)];
      t.log(`No targets visible — random safe move: ${d}`, 'warn');
      executeAction(state, 'MOVE', d);
    } else {
      t.log(`No targets, no safe moves — WAIT`, 'warn');
      executeAction(state, 'WAIT', null);
    }
    return;
  }

  for (const { k, m, dist } of edible) {
    t.scope(`Targeting Lv${m.level} at (${m.r},${m.c}), dist=${dist}`, 'info', () => {
      if (dist === 1) {
        t.log(`Adjacent — attacking now`, 'action');
        executeAction(state, 'ATTACK', k);
        return;
      }
      for (const d of DIRS) {
        const [dr, dc] = VEC[d];
        const ar = m.r + dr, ac = m.c + dc;
        if (ar < 0 || ar >= R || ac < 0 || ac >= C) continue;
        const path = bfs(agent.r, agent.c, ar, ac, R, C, blocked, danger);
        if (path.length) {
          t.log(`BFS path found — moving ${path[0]} (${path.length} steps)`, 'action');
          executeAction(state, 'MOVE', path[0]);
          return;
        }
      }
      t.log(`No path to (${m.r},${m.c}) — trying next target`, 'warn');
    });
    if (!state.agent.alive || state.monsters.size < monsters.size) return;
  }
}

// ─── Algorithm 2: Basic BFS ───────────────────────────────────────────────────

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

function basicBFSStep(state: GameState, t: Tracer): void {
  const { agent, monsters, R, C, dangerTiles: danger } = state;
  const local = getBasicState(state);

  // Perceive 4 cardinal neighbors
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

  t.scope(`Perception — 4-direction scan`, 'info', () => {
    t.log(`Known free cells: ${local.knownFree.size}`, 'info');
    t.log(`Known monsters in memory: ${local.knownMonsters.size}`, 'info');
  });

  if (local.knownMonsters.size > 0) {
    const choices = [...local.knownMonsters.entries()]
      .filter(([, m]) => m.level <= agent.level)
      .map(([k, m]) => ({ k, m, dist: Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c) }))
      .sort((a, b) => a.dist - b.dist);

    if (choices.length === 0) {
      t.log(`Known monsters all too strong (agent Lv${agent.level}) — will explore`, 'warn');
    }

    for (const { k, m } of choices) {
      const [mr, mc] = [m.r, m.c];
      let acted = false;
      t.scope(`Target Lv${m.level} at (${mr},${mc})`, 'info', () => {
        if (Math.abs(mr - agent.r) + Math.abs(mc - agent.c) === 1) {
          t.log(`Adjacent — attacking`, 'action');
          executeAction(state, 'ATTACK', k);
          acted = true;
          return;
        }
        for (const d of DIRS) {
          const [dr, dc] = VEC[d];
          const ar = mr + dr, ac = mc + dc;
          if (!local.knownFree.has(key(ar, ac))) continue;
          const path = bfs(agent.r, agent.c, ar, ac, R, C, blocked, danger);
          if (path.length) {
            const [nr, nc] = [agent.r + VEC[path[0]][0], agent.c + VEC[path[0]][1]];
            if (danger.has(key(nr, nc))) {
              t.log(`Path found but next cell is a danger zone — WAIT`, 'warn');
              executeAction(state, 'WAIT', null);
              acted = true;
              return;
            }
            t.log(`BFS path found — moving ${path[0]} (${path.length} steps)`, 'action');
            executeAction(state, 'MOVE', path[0]);
            acted = true;
            return;
          }
        }
        t.log(`No path to (${mr},${mc}) via known cells`, 'warn');
      });
      if (acted) return;
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

  t.scope(`Frontier exploration`, 'info', () => {
    if (!frontiers.length) {
      t.log(`No frontier cells found — WAIT`, 'warn');
      executeAction(state, 'WAIT', null);
      return;
    }
    frontiers.sort((a, b) => (Math.abs(a[0] - agent.r) + Math.abs(a[1] - agent.c)) - (Math.abs(b[0] - agent.r) + Math.abs(b[1] - agent.c)));
    const [gr, gc] = frontiers[0];
    t.log(`${frontiers.length} frontier cell(s) — nearest at (${gr},${gc})`, 'info');
    const path = bfs(agent.r, agent.c, gr, gc, R, C, blocked, danger);
    if (path.length) {
      const [nr, nc] = [agent.r + VEC[path[0]][0], agent.c + VEC[path[0]][1]];
      if (!danger.has(key(nr, nc))) {
        t.log(`BFS path to frontier — moving ${path[0]}`, 'action');
        executeAction(state, 'MOVE', path[0]);
        return;
      }
    }
    t.log(`Frontier unreachable or blocked by danger — WAIT`, 'warn');
    executeAction(state, 'WAIT', null);
  });
}

// ─── Algorithm 3: A* Pure ────────────────────────────────────────────────────

function astarStep(state: GameState, t: Tracer): void {
  const { agent, monsters, R, C, dangerTiles: danger } = state;
  const blocked = new Set(monsters.keys());

  const targets = [...monsters.entries()]
    .filter(([, m]) => m.level <= agent.level)
    .map(([k, m]) => ({ k, m, dist: Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c) }))
    .sort((a, b) => a.dist - b.dist || b.m.level - a.m.level);

  t.scope(`Perception — 4-direction scan`, 'info', () => {
    t.log(`Total monsters on grid: ${monsters.size}`, 'info');
    t.log(`Beatable targets (Lv ≤ ${agent.level}): ${targets.length}`, targets.length > 0 ? 'success' : 'warn');
  });

  if (!targets.length) {
    t.log(`No beatable targets — WAIT`, 'warn');
    executeAction(state, 'WAIT', null);
    return;
  }

  for (const { k, m } of targets) {
    let acted = false;
    t.scope(`Target Lv${m.level} at (${m.r},${m.c}), dist=${Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c)}`, 'info', () => {
      if (Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c) === 1) {
        t.log(`Adjacent — attacking`, 'action');
        executeAction(state, 'ATTACK', k);
        acted = true;
        return;
      }
      const safe: Array<[number, number]> = [];
      for (const d of DIRS) {
        const [dr, dc] = VEC[d];
        const ar = m.r + dr, ac = m.c + dc;
        if (ar >= 0 && ar < R && ac >= 0 && ac < C && !blocked.has(key(ar, ac)) && d !== m.facing) {
          safe.push([ar, ac]);
        }
      }
      t.log(`Approach candidates (non-facing sides): ${safe.length}`, 'info');
      for (const [ar, ac] of safe) {
        const path = astar(agent.r, agent.c, ar, ac, R, C, blocked, danger);
        if (path.length) {
          t.log(`A* path to (${ar},${ac}) — moving ${path[0]} (${path.length} steps), h=${Math.abs(agent.r - ar) + Math.abs(agent.c - ac)}`, 'action');
          executeAction(state, 'MOVE', path[0]);
          acted = true;
          return;
        }
      }
      t.log(`No A* path found to any safe approach cell`, 'warn');
    });
    if (acted) return;
  }

  t.log(`All targets unreachable — WAIT`, 'warn');
  executeAction(state, 'WAIT', null);
}

// ─── Algorithm 4: A* + Manhattan Explore ─────────────────────────────────────

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

function astarManhattanStep(state: GameState, t: Tracer): void {
  const { agent, monsters, R, C, dangerTiles: danger } = state;
  const local = getAMState(state);

  // Perceive 4 cardinal neighbors
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

  t.scope(`Perception — 4-direction scan`, 'info', () => {
    t.log(`Known free cells: ${local.knownFree.size}`, 'info');
    t.log(`Known monsters: ${local.knownMonsters.size}`, 'info');
  });

  const viable = [...monsters.entries()]
    .filter(([, m]) => m.level <= agent.level)
    .map(([k, m]) => ({ k, m, dist: Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c) }))
    .sort((a, b) => a.dist - b.dist || b.m.level - a.m.level);

  if (viable.length > 0) {
    t.log(`Beatable targets (Lv ≤ ${agent.level}): ${viable.length}`, 'success');
  }

  for (const { k, m } of viable) {
    let acted = false;
    t.scope(`Target Lv${m.level} at (${m.r},${m.c})`, 'info', () => {
      if (Math.abs(m.r - agent.r) + Math.abs(m.c - agent.c) === 1) {
        t.log(`Adjacent — attacking`, 'action');
        executeAction(state, 'ATTACK', k);
        acted = true;
        return;
      }
      const safe: Array<[number, number]> = [];
      for (const d of DIRS) {
        const [dr, dc] = VEC[d];
        const ar = m.r + dr, ac = m.c + dc;
        if (ar >= 0 && ar < R && ac >= 0 && ac < C && !blocked.has(key(ar, ac)) && d !== m.facing) {
          safe.push([ar, ac]);
        }
      }
      t.log(`Safe approach sides: ${safe.length} (avoiding monster facing direction)`, 'info');
      for (const [ar, ac] of safe) {
        const path = astar(agent.r, agent.c, ar, ac, R, C, blocked, danger);
        if (path.length) {
          t.log(`A* path to (${ar},${ac}) — moving ${path[0]} (${path.length} steps)`, 'action');
          executeAction(state, 'MOVE', path[0]);
          acted = true;
          return;
        }
      }
      t.log(`No A* path to any approach cell`, 'warn');
    });
    if (acted) return;
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

  t.scope(`Frontier exploration`, 'info', () => {
    if (!frontiers.length) {
      t.log(`No frontier cells — WAIT`, 'warn');
      executeAction(state, 'WAIT', null);
      return;
    }
    frontiers.sort((a, b) => (Math.abs(a[0] - agent.r) + Math.abs(a[1] - agent.c)) - (Math.abs(b[0] - agent.r) + Math.abs(b[1] - agent.c)));
    const [gr, gc] = frontiers[0];
    t.log(`${frontiers.length} frontier cell(s) — nearest (${gr},${gc}), Manhattan dist=${Math.abs(gr - agent.r) + Math.abs(gc - agent.c)}`, 'info');
    const path = astar(agent.r, agent.c, gr, gc, R, C, blocked, danger);
    if (path.length) {
      t.log(`A* path to frontier — moving ${path[0]} (${path.length} steps)`, 'action');
      executeAction(state, 'MOVE', path[0]);
      return;
    }
    t.log(`Frontier unreachable — WAIT`, 'warn');
    executeAction(state, 'WAIT', null);
  });
}

// ─── Public step function ─────────────────────────────────────────────────────

export function stepGame(state: GameState, algorithmId: AlgorithmId): TraceNode {
  if (state.done) return { label: 'Simulation finished', type: 'warn', children: [] };

  state.turn++;
  stepMonsters(state);
  state.dangerTiles = dangerTiles(state.monsters, state.R, state.C);

  const t = new Tracer(`Turn ${state.turn} — ${algorithmId}`);

  switch (algorithmId) {
    case 'SimpleBFS':       simpleBFSStep(state, t);       break;
    case 'BasicBFS':        basicBFSStep(state, t);         break;
    case 'AStar':           astarStep(state, t);            break;
    case 'AStarManhattan':  astarManhattanStep(state, t);   break;
  }

  if (state.agent.alive) checkMonsterAttack(state);
  finishStep(state);
  return t.root;
}
