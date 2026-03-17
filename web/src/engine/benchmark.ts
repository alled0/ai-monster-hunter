import { type AlgorithmId, ALGORITHMS } from './types';
import { createEnvironment } from './environment';
import { stepGame } from './algorithms';

const MAX_TURNS = 600;
const RUNS = 50;
const ROWS = 10, COLS = 10, N_MONSTERS = 8;

export interface RunResult {
  won: boolean;
  kills: number;
  turns: number;
  finalLevel: number;
}

export interface AlgoStats {
  id: AlgorithmId;
  name: string;
  color: string;
  wins: number;
  winRate: number;
  avgKills: number;
  avgTurns: number;
  avgLevel: number;
  bestKills: number;
  runs: RunResult[];
}

function runOnce(algoId: AlgorithmId): RunResult {
  const state = createEnvironment(ROWS, COLS, N_MONSTERS);
  while (!state.done && state.turn < MAX_TURNS) {
    stepGame(state, algoId);
  }
  return {
    won: state.won,
    kills: state.agent.kills,
    turns: state.turn,
    finalLevel: state.agent.level,
  };
}

export function runBenchmark(
  onProgress?: (algoId: AlgorithmId, done: number, total: number) => void
): AlgoStats[] {
  const results: AlgoStats[] = [];

  for (const algo of ALGORITHMS) {
    const runs: RunResult[] = [];
    for (let i = 0; i < RUNS; i++) {
      runs.push(runOnce(algo.id));
      onProgress?.(algo.id, i + 1, RUNS);
    }
    const wins = runs.filter(r => r.won).length;
    results.push({
      id: algo.id,
      name: algo.name,
      color: algo.color,
      wins,
      winRate: wins / RUNS,
      avgKills: runs.reduce((s, r) => s + r.kills, 0) / RUNS,
      avgTurns: runs.reduce((s, r) => s + r.turns, 0) / RUNS,
      avgLevel: runs.reduce((s, r) => s + r.finalLevel, 0) / RUNS,
      bestKills: Math.max(...runs.map(r => r.kills)),
      runs,
    });
  }

  // Sort by win rate, then avg kills
  results.sort((a, b) => b.winRate - a.winRate || b.avgKills - a.avgKills);
  return results;
}
