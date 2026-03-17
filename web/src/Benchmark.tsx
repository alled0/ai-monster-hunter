import { useState } from 'react';
import { type AlgoStats, runBenchmark } from './engine/benchmark';
import './Benchmark.css';

const RANK_LABELS = ['1st', '2nd', '3rd', '4th'];

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function StatCell({ value, label, max, color }: { value: number; label: string; max: number; color: string }) {
  return (
    <div className="stat-cell">
      <span className="stat-cell-val">{label}</span>
      <Bar value={value} max={max} color={color} />
    </div>
  );
}

export default function Benchmark() {
  const [results, setResults] = useState<AlgoStats[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const run = () => {
    setRunning(true);
    setResults(null);
    setProgress({});
    setTimeout(() => {
      const res = runBenchmark((algoId, done, total) => {
        setProgress(p => ({ ...p, [algoId]: done / total }));
      });
      setResults(res);
      setRunning(false);
    }, 20);
  };

  const maxWinRate = results ? Math.max(...results.map(r => r.winRate)) : 1;
  const maxKills   = results ? Math.max(...results.map(r => r.avgKills)) : 1;
  const maxTurns   = results ? Math.max(...results.map(r => r.avgTurns)) : 1;
  const maxLevel   = results ? Math.max(...results.map(r => r.avgLevel)) : 1;

  return (
    <div className="bench">
      <div className="bench-header">
        <div>
          <h2 className="bench-title">Algorithm Comparison</h2>
          <p className="bench-sub">50 independent runs per algorithm on a 10×10 grid with 8 monsters</p>
        </div>
        <button className="run-btn" onClick={run} disabled={running}>
          {running ? 'Running...' : 'Run Benchmark'}
        </button>
      </div>

      {running && (
        <div className="progress-section">
          {['SimpleBFS', 'BasicBFS', 'AStar', 'AStarManhattan'].map(id => {
            const pct = (progress[id] ?? 0) * 100;
            return (
              <div key={id} className="progress-row">
                <span className="progress-label">{id}</span>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="progress-pct">{Math.round(pct)}%</span>
              </div>
            );
          })}
        </div>
      )}

      {!results && !running && (
        <div className="bench-empty">
          <div className="bench-empty-graphic" />
          <p>Run the benchmark to compare all four algorithms across 50 simulations each.</p>
          <p className="bench-empty-sub">Results include win rate, average kills, turns survived, and final level reached.</p>
        </div>
      )}

      {results && (
        <>
          {/* Ranking cards */}
          <div className="podium">
            {results.map((r, i) => (
              <div
                key={r.id}
                className={`podium-card rank-${i}`}
                style={{ borderColor: r.color + '66', boxShadow: i === 0 ? `0 0 24px ${r.color}33` : 'none' }}
              >
                <span className="podium-rank">{RANK_LABELS[i]}</span>
                <span className="podium-name" style={{ color: r.color }}>{r.name}</span>
                <span className="podium-winrate">{Math.round(r.winRate * 100)}% win rate</span>
              </div>
            ))}
          </div>

          {/* Detailed table */}
          <div className="results-table">
            <div className="table-head">
              <span>Rank</span>
              <span>Algorithm</span>
              <span>Win Rate</span>
              <span>Avg Kills</span>
              <span>Avg Turns</span>
              <span>Avg Level</span>
              <span>Best Run</span>
            </div>
            {results.map((r, i) => (
              <div key={r.id} className={`table-row ${i === 0 ? 'top-row' : ''}`}>
                <span className="rank-num">{RANK_LABELS[i]}</span>
                <span className="algo-name" style={{ color: r.color }}>{r.name}</span>
                <StatCell
                  value={r.winRate} max={maxWinRate} color={r.color}
                  label={`${Math.round(r.winRate * 100)}%`}
                />
                <StatCell
                  value={r.avgKills} max={maxKills} color={r.color}
                  label={r.avgKills.toFixed(1)}
                />
                <StatCell
                  value={r.avgTurns} max={maxTurns} color={r.color}
                  label={r.avgTurns.toFixed(0)}
                />
                <StatCell
                  value={r.avgLevel} max={maxLevel} color={r.color}
                  label={r.avgLevel.toFixed(1)}
                />
                <span className="best-run">{r.bestKills} kills</span>
              </div>
            ))}
          </div>

          {/* Win rate bar chart */}
          <div className="chart-section">
            <h3 className="chart-title">Win Rate</h3>
            <div className="chart-bars">
              {results.map(r => (
                <div key={r.id} className="chart-bar-col">
                  <span className="chart-bar-pct">{Math.round(r.winRate * 100)}%</span>
                  <div className="chart-bar-outer">
                    <div
                      className="chart-bar-inner"
                      style={{
                        height: `${Math.round(r.winRate * 100)}%`,
                        background: `linear-gradient(to top, ${r.color}cc, ${r.color}55)`,
                        boxShadow: `0 0 12px ${r.color}44`,
                      }}
                    />
                  </div>
                  <span className="chart-bar-name" style={{ color: r.color }}>{r.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Run outcome dots */}
          <div className="dist-section">
            <h3 className="chart-title">Run Outcomes — 50 runs per algorithm</h3>
            <div className="dist-grid">
              {results.map(r => (
                <div key={r.id} className="dist-col">
                  <span className="dist-label" style={{ color: r.color }}>{r.name}</span>
                  <div className="dist-dots">
                    {r.runs.map((run, j) => (
                      <div
                        key={j}
                        className={`dot ${run.won ? 'dot-win' : 'dot-loss'}`}
                        style={run.won ? { background: r.color, boxShadow: `0 0 4px ${r.color}` } : {}}
                        title={`Run ${j + 1}: ${run.kills} kills, ${run.turns} turns — ${run.won ? 'won' : 'lost'}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="dist-legend">
              <span className="dot dot-win" style={{ display: 'inline-block' }} /> Win &nbsp;
              <span className="dot dot-loss" style={{ display: 'inline-block' }} /> Loss
            </p>
          </div>
        </>
      )}
    </div>
  );
}
