export type Direction = 'N' | 'S' | 'W' | 'E';

export const DIRS: Direction[] = ['N', 'S', 'W', 'E'];

export const VEC: Record<Direction, [number, number]> = {
  N: [-1, 0], S: [1, 0], W: [0, -1], E: [0, 1],
};

export const ARROW: Record<Direction, string> = {
  N: '↑', S: '↓', W: '←', E: '→',
};

export const CW: Direction[] = ['N', 'E', 'S', 'W'];

export interface Monster {
  r: number;
  c: number;
  level: number;
  facing: Direction;
  turns: number;
}

export interface Agent {
  r: number;
  c: number;
  level: number;
  kills: number;
  alive: boolean;
}

export interface GameState {
  R: number;
  C: number;
  turn: number;
  agent: Agent;
  monsters: Map<string, Monster>;
  dangerTiles: Set<string>;
  done: boolean;
  won: boolean;
}

export type AlgorithmId = 'SimpleBFS' | 'BasicBFS' | 'AStar' | 'AStarManhattan';

export interface TraceNode {
  label: string;
  type: 'info' | 'success' | 'warn' | 'action' | 'death';
  children: TraceNode[];
}

export interface AlgorithmMeta {
  id: AlgorithmId;
  name: string;
  description: string;
  color: string;
}

export const ALGORITHMS: AlgorithmMeta[] = [
  {
    id: 'SimpleBFS',
    name: 'Simple BFS',
    description: 'BFS with 8-neighbor perception. Sees diagonals, avoids danger zones, moves randomly when no target found.',
    color: '#3b82f6',
  },
  {
    id: 'BasicBFS',
    name: 'Basic BFS',
    description: 'BFS with 4-neighbor perception. Explores unknown frontier cells when no known target. Waits if path is dangerous.',
    color: '#10b981',
  },
  {
    id: 'AStar',
    name: 'A* (Pure)',
    description: 'A* with Manhattan heuristic. 4-neighbor perception. Approaches monsters from their safe (non-facing) side.',
    color: '#f59e0b',
  },
  {
    id: 'AStarManhattan',
    name: 'A* + Manhattan Explore',
    description: 'A* with Manhattan heuristic and frontier exploration. Combines pathfinding efficiency with systematic map discovery.',
    color: '#ec4899',
  },
];

export function key(r: number, c: number) { return `${r},${c}`; }
export function parseKey(k: string): [number, number] {
  const [r, c] = k.split(',').map(Number);
  return [r, c];
}

export function rotateCW(facing: Direction): Direction {
  return CW[(CW.indexOf(facing) + 1) % 4];
}

export function dangerTiles(monsters: Map<string, Monster>, R: number, C: number): Set<string> {
  const tiles = new Set<string>();
  for (const m of monsters.values()) {
    const [dr, dc] = VEC[m.facing];
    const nr = m.r + dr, nc = m.c + dc;
    if (nr >= 0 && nr < R && nc >= 0 && nc < C) tiles.add(key(nr, nc));
  }
  return tiles;
}
