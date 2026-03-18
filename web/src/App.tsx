import { useCallback, useEffect, useRef, useState } from 'react';
import { type GameState, type AlgorithmId, type TraceNode, ALGORITHMS, ARROW, key } from './engine/types';

type TurnOutcome = 'explore' | 'revisit' | 'kill' | 'death';
const OUTCOME_TYPE: Record<TurnOutcome, TraceNode['type']> = {
  explore: 'info',
  revisit: 'warn',
  kill:    'success',
  death:   'death',
};
import { createEnvironment } from './engine/environment';
import { stepGame } from './engine/algorithms';
import Benchmark from './Benchmark';
import TreeViz from './TreeViz';
import './App.css';

const ROWS = 10, COLS = 10, N_MONSTERS = 8;
const TRAIL_MAX = 500;
const HISTORY_MAX = 100;

interface TurnRecord { turn: number; trace: TraceNode; outcome: TurnOutcome; }

function levelColor(level: number): string {
  const colors = [
    '#40e0d0','#00bcd4','#48d1cc','#00bfff','#87cefa',
    '#98fb98','#3cb371','#7cfc00','#ffff00','#ffd700',
    '#ffa500','#ff8c00','#ff6347','#ff4500','#ff1493',
    '#db7093','#c71585','#ba55d3','#9370db','#8a2be2',
  ];
  return colors[Math.min(level - 1, colors.length - 1)];
}

function cloneState(s: GameState): GameState {
  return {
    ...s,
    agent: { ...s.agent },
    monsters: new Map([...s.monsters].map(([k, m]) => [k, { ...m }])),
    dangerTiles: new Set(s.dangerTiles),
  };
}

export default function App() {
  const [tab, setTab] = useState<'watch' | 'benchmark'>('watch');
  const [algo, setAlgo] = useState<AlgorithmId>('SimpleBFS');
  const [state, setState] = useState<GameState>(() => createEnvironment(ROWS, COLS, N_MONSTERS));
  const [speed, setSpeed] = useState(300);
  const [paused, setPaused] = useState(false);
  const [turnHistory, setTurnHistory] = useState<TurnRecord[]>([]);
  const [trail, setTrail] = useState<string[]>([]);

  const stateRef = useRef(state);
  const algoRef = useRef(algo);
  const pausedRef = useRef(paused);
  const visitedRef = useRef<Set<string>>(new Set());
  stateRef.current = state;
  algoRef.current = algo;
  pausedRef.current = paused;

  const reset = useCallback(() => {
    setState(createEnvironment(ROWS, COLS, N_MONSTERS));
    setTurnHistory([]);
    setTrail([]);
    setPaused(false);
    visitedRef.current = new Set();
  }, []);

  const step = useCallback(() => {
    const s = cloneState(stateRef.current);
    if (s.done) return;
    const prevKills = s.agent.kills;
    const traceRoot = stepGame(s, algoRef.current);
    const newPos = key(s.agent.r, s.agent.c);

    let outcome: TurnOutcome;
    if (!s.agent.alive) outcome = 'death';
    else if (s.agent.kills > prevKills) outcome = 'kill';
    else if (visitedRef.current.has(newPos)) outcome = 'revisit';
    else outcome = 'explore';
    visitedRef.current.add(newPos);

    setTurnHistory(h => {
      const next = [...h, { turn: s.turn, trace: traceRoot, outcome }];
      return next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next;
    });
    setTrail(prev => {
      const next = [...prev, newPos];
      return next.length > TRAIL_MAX ? next.slice(next.length - TRAIL_MAX) : next;
    });
    setState(s);
  }, []);

  useEffect(() => {
    if (paused || state.done) return;
    const id = setInterval(() => { if (!pausedRef.current) step(); }, speed);
    return () => clearInterval(id);
  }, [paused, speed, state.done, step]);

  const handleAlgo = (id: AlgorithmId) => {
    setAlgo(id);
    algoRef.current = id;
    setState(createEnvironment(ROWS, COLS, N_MONSTERS));
    setTurnHistory([]);
    setTrail([]);
    setPaused(false);
    visitedRef.current = new Set();
  };

  const algoMeta = ALGORITHMS.find(a => a.id === algo)!;
  const { agent, monsters, dangerTiles: danger, turn, done, won } = state;

  const trailMap = new Map<string, number>();
  trail.forEach((k, i) => {
    const t = (i + 1) / trail.length;
    trailMap.set(k, 0.15 + t * 0.55);
  });

  // Turn history tree: root → each turn as a leaf node colored by outcome
  const historyTree: TraceNode | null = turnHistory.length > 0 ? {
    label: `${algo} — ${turnHistory.length} turn${turnHistory.length === 1 ? '' : 's'}`,
    type: 'info',
    children: turnHistory.map(rec => ({
      label: `T${rec.turn}`,
      type: OUTCOME_TYPE[rec.outcome],
      children: [],
    })),
  } : null;

  // Latest turn's full algorithm trace
  const latestTrace = turnHistory.length > 0 ? turnHistory[turnHistory.length - 1].trace : null;

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Monster Hunter</h1>
        <p className="subtitle">A pathfinding simulation — agents navigate a grid hunting monsters using classic search algorithms</p>
      </header>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'watch' ? 'tab-active' : ''}`} onClick={() => setTab('watch')}>
          Simulation
        </button>
        <button className={`tab-btn ${tab === 'benchmark' ? 'tab-active' : ''}`} onClick={() => setTab('benchmark')}>
          Benchmark
        </button>
      </div>

      {tab === 'benchmark' && <Benchmark />}

      {tab === 'watch' && <>
      <section className="algo-bar">
        {ALGORITHMS.map(a => (
          <button
            key={a.id}
            className={`algo-btn ${algo === a.id ? 'active' : ''}`}
            style={algo === a.id ? { borderColor: a.color, boxShadow: `0 0 16px ${a.color}66`, color: a.color } : {}}
            onClick={() => handleAlgo(a.id)}
          >
            <span className="algo-btn-name">{a.name}</span>
          </button>
        ))}
      </section>

      <div className="algo-desc-bar">
        <span className="algo-dot" style={{ background: algoMeta.color }} />
        <p className="algo-desc">{algoMeta.description}</p>
      </div>

      <div className="main-layout">
        <div className="grid-wrapper">
          {done && (
            <div className={`overlay ${won ? 'won' : 'lost'}`}>
              <div className="overlay-content">
                <span className="overlay-badge">{won ? 'Victory' : 'Eliminated'}</span>
                <span className="overlay-msg">{won ? 'All monsters cleared' : 'Agent was defeated'}</span>
                <span className="overlay-sub">
                  {won
                    ? `Completed in ${turn} turns — ${agent.kills} kills`
                    : `Survived ${turn} turns — ${agent.kills} kills`}
                </span>
                <button className="ctrl-btn primary" onClick={reset}>Run Again</button>
              </div>
            </div>
          )}
          <div className="grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
            {Array.from({ length: ROWS }, (_, r) =>
              Array.from({ length: COLS }, (_, c) => {
                const k = key(r, c);
                const isAgent = agent.r === r && agent.c === c;
                const monster = monsters.get(k);
                const isDanger = danger.has(k) && !monster && !isAgent;
                const trailOpacity = !isAgent && !monster ? trailMap.get(k) : undefined;
                return (
                  <div key={k} className={`cell ${isDanger ? 'danger' : ''}`}>
                    {trailOpacity !== undefined && (
                      <div className="cell-trail" style={{ opacity: trailOpacity }} />
                    )}
                    {isAgent && (
                      <div className="cell-agent">
                        <span className="cell-icon">A</span>
                        <span className="cell-sub">Lv{agent.level}</span>
                      </div>
                    )}
                    {monster && !isAgent && (
                      <div className="cell-monster" style={{
                        background: levelColor(monster.level) + '22',
                        borderColor: levelColor(monster.level) + 'aa',
                      }}>
                        <span className="cell-icon" style={{ color: levelColor(monster.level) }}>
                          {ARROW[monster.facing]}
                        </span>
                        <span className="cell-sub" style={{ color: levelColor(monster.level) }}>
                          Lv{monster.level}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="panel">
          <div className="card">
            <h3 className="card-title">Stats</h3>
            <div className="stats-grid">
              <div className="stat">
                <span className="stat-label">Turn</span>
                <span className="stat-value">{turn}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Level</span>
                <span className="stat-value" style={{ color: '#3b82f6' }}>{agent.level}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Kills</span>
                <span className="stat-value" style={{ color: '#10b981' }}>{agent.kills}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Remaining</span>
                <span className="stat-value" style={{ color: '#f59e0b' }}>{monsters.size}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Controls</h3>
            <div className="ctrl-row">
              <button className="ctrl-btn primary" onClick={() => setPaused(p => !p)} disabled={done}>
                {paused ? 'Play' : 'Pause'}
              </button>
              <button className="ctrl-btn" onClick={step} disabled={done || !paused}>
                Step
              </button>
              <button className="ctrl-btn danger" onClick={reset}>Reset</button>
            </div>
            <div className="speed-row">
              <label className="speed-label">Speed</label>
              <input
                type="range" min={50} max={800} step={50}
                value={speed}
                onChange={e => setSpeed(Number(e.target.value))}
                className="slider"
              />
              <span className="speed-val">{speed}ms/step</span>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Legend</h3>
            <div className="legend">
              <div className="legend-row">
                <div className="legend-swatch agent-sw">A</div>
                <span>Agent — the hunter</span>
              </div>
              <div className="legend-row">
                <div className="legend-swatch monster-sw">M</div>
                <span>Monster — arrow shows facing direction</span>
              </div>
              <div className="legend-row">
                <div className="legend-swatch danger-sw" />
                <span>Danger zone — monster line of sight</span>
              </div>
            </div>
            <div className="level-bar">
              {[1,3,5,7,9,11,13,15,17,19].map(l => (
                <div key={l} className="level-chip" style={{ background: levelColor(l) }} title={`Level ${l}`} />
              ))}
            </div>
            <div className="level-bar-labels">
              <span>Low level</span><span>High level</span>
            </div>
          </div>
        </div>
      </div>

      {historyTree && (
        <div className="tree-section">
          <div className="card tree-card">
            <div className="tree-card-header">
              <h3 className="card-title" style={{ marginBottom: 0 }}>Turn History</h3>
              <div className="turn-legend">
                <span className="turn-legend-item explore">Explore</span>
                <span className="turn-legend-item revisit">Revisit</span>
                <span className="turn-legend-item kill">Kill</span>
                <span className="turn-legend-item death">Death</span>
              </div>
            </div>
            <TreeViz node={historyTree} />
          </div>

          {latestTrace && (
            <div className="card tree-card" style={{ marginTop: 12 }}>
              <h3 className="card-title">Decision Tree — Turn {turnHistory[turnHistory.length - 1].turn}</h3>
              <TreeViz node={latestTrace} />
            </div>
          )}
        </div>
      )}

      <footer className="footer">
        <p>Monster Hunter — SimpleBFS · BasicBFS · A* · A* + Manhattan</p>
        <p>
          Developed by{' '}
          <a href="https://www.linkedin.com/in/alwaleed-meshal-almutairi-8a48ab263/" target="_blank" rel="noopener noreferrer" className="footer-link">Alwaleed Almutairi</a>
          {' · '}
          <a href="https://github.com/alled0" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
        </p>
      </footer>
      </>}
    </div>
  );
}
