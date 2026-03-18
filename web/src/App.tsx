import { useCallback, useEffect, useRef, useState } from 'react';
import { type GameState, type AlgorithmId, type TraceNode, ALGORITHMS, ARROW, key } from './engine/types';
import { createEnvironment } from './engine/environment';
import { stepGame } from './engine/algorithms';
import Benchmark from './Benchmark';
import TreeViz from './TreeViz';
import './App.css';

const ROWS = 10, COLS = 10, N_MONSTERS = 8;

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
  const [history, setHistory] = useState<Array<{ turn: number; kills: number; level: number }>>([]);
  const [trace, setTrace] = useState<TraceNode | null>(null);
  const [trail, setTrail] = useState<string[]>([]); // ordered oldest→newest, capped at TRAIL_MAX

  const TRAIL_MAX = 500;

  const stateRef = useRef(state);
  const algoRef = useRef(algo);
  const pausedRef = useRef(paused);
  stateRef.current = state;
  algoRef.current = algo;
  pausedRef.current = paused;

  const reset = useCallback(() => {
    setState(createEnvironment(ROWS, COLS, N_MONSTERS));
    setHistory([]);
    setTrace(null);
    setTrail([]);
    setPaused(false);
  }, []);

  const step = useCallback(() => {
    const s = cloneState(stateRef.current);
    if (s.done) return;
    const traceRoot = stepGame(s, algoRef.current);
    setHistory(h => [...h, { turn: s.turn, kills: s.agent.kills, level: s.agent.level }]);
    setTrace(traceRoot);
    setTrail(prev => {
      const next = [...prev, key(s.agent.r, s.agent.c)];
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
    setHistory([]);
    setTrace(null);
    setTrail([]);
    setPaused(false);
  };

  const algoMeta = ALGORITHMS.find(a => a.id === algo)!;
  const { agent, monsters, dangerTiles: danger, turn, done, won } = state;

  // Build trail lookup: cell key → opacity (0.08 oldest … 0.55 newest)
  const trailMap = new Map<string, number>();
  trail.forEach((k, i) => {
    const t = (i + 1) / trail.length; // 0..1, 1 = newest
    trailMap.set(k, 0.15 + t * 0.55);
  });

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

          <div className="card log-card">
            <h3 className="card-title">Activity Log</h3>
            <div className="log-scroll">
              {history.length === 0 && <p className="log-empty">Simulation running...</p>}
              {[...history].reverse().slice(0, 20).map((h, i) => (
                <div key={i} className="log-row">
                  <span className="log-turn">Turn {h.turn}</span>
                  <span className="log-kills" style={{ color: '#10b981' }}>{h.kills} kills</span>
                  <span className="log-level" style={{ color: '#3b82f6' }}>Lv{h.level}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {trace && (
        <div className="tree-section">
          <div className="card tree-card">
            <h3 className="card-title">Decision Tree — last turn</h3>
            <TreeViz node={trace} />
          </div>
        </div>
      )}

      <footer className="footer">
        <p>Monster Hunter — SimpleBFS · BasicBFS · A* · A* + Manhattan</p>
      </footer>
      </>}
    </div>
  );
}
