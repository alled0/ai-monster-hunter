import { memo } from 'react';
import type { TraceNode } from './engine/types';

// ── Layout constants ──────────────────────────────────────────────
const NR  = 26;    // node radius → 52px diameter
const HG  = 28;    // horizontal gap between adjacent circle edges
const VG  = 100;   // vertical gap between level centers (gap between edges = 100 - 52 = 48px ≥ 40px)
const PAD = 48;    // canvas padding

// ── Colours (outline-only style, dark fill) ───────────────────────
const ROOT_STROKE  = '#ef4444';   // red for root
const ROOT_TEXT    = '#fca5a5';

const STROKE: Record<TraceNode['type'], string> = {
  info:    '#334155',   // muted gray
  success: '#10b981',   // green
  warn:    '#f59e0b',   // amber
  action:  '#3b82f6',   // blue
  death:   '#ef4444',   // red
};

const TEXT_CLR: Record<TraceNode['type'], string> = {
  info:    '#64748b',
  success: '#34d399',
  warn:    '#fbbf24',
  action:  '#60a5fa',
  death:   '#f87171',
};

const NODE_BG = '#07101f';  // dark fill inside every circle

// ── Label helpers ─────────────────────────────────────────────────
function topLabel(label: string): string {
  const t = label.trim();
  const m = t.match(/Turn\s*(\d+)/);       if (m) return `T${m[1]}`;
  if (/moving\s+(\w)/i.test(t))            { const d = t.match(/moving\s+(\w)/i)!; return `→${d[1]}`; }
  if (/attack/i.test(t))                    return 'ATK';
  if (/\bWAIT\b/i.test(t))                 return 'WAIT';
  if (/no safe|no path|no frontier/i.test(t)) return '✗';
  if (/A\*.*path|path.*A\*/i.test(t))      return 'A*';
  if (/BFS.*path|path.*BFS/i.test(t))      return 'BFS';
  if (/perception/i.test(t))               return 'PER';
  if (/frontier/i.test(t))                 return 'FRT';
  if (/beatable/i.test(t))                 return 'BT';
  if (/approach/i.test(t))                 return 'APR';
  const lvM = t.match(/Lv\s*(\d+)/);       if (lvM) return `L${lvM[1]}`;
  if (/target/i.test(t))                   return 'TGT';
  if (/total\s+monster/i.test(t))          return 'TOT';
  if (/scanned/i.test(t))                  return 'SCN';
  const words = t.split(/[\s—–\[\]]+/).filter(Boolean);
  return words[0]?.slice(0, 4).toUpperCase() ?? '?';
}

function botLabel(label: string): string {
  const t = label.trim();
  const numM = t.match(/:\s*(\d+)/) ?? t.match(/dist=(\d+)/) ?? t.match(/(\d+)\s+step/);
  if (numM) return numM[1];
  const coord = t.match(/\((\d+),(\d+)\)/);
  if (coord) return `${coord[1]},${coord[2]}`;
  const turnOutcome = t.match(/\[(kill|death|revisit|explore)\]/i);
  if (turnOutcome) return turnOutcome[1].slice(0, 3);
  return '';
}

// ── Layout types ──────────────────────────────────────────────────
interface Placed { node: TraceNode; key: string; cx: number; cy: number; children: Placed[] }
interface Edge   { x1: number; y1: number; x2: number; y2: number }

// ── Reingold-Tilford width ────────────────────────────────────────
const LEAF_W = 2 * NR + HG;

function subtreeWidth(node: TraceNode, nk: string, cache: Map<string, number>): number {
  if (cache.has(nk)) return cache.get(nk)!;
  const w = node.children.length === 0
    ? LEAF_W
    : Math.max(
        node.children.reduce((s, c, i) => s + subtreeWidth(c, `${nk}.${i}`, cache), 0),
        LEAF_W
      );
  cache.set(nk, w);
  return w;
}

function placeTree(node: TraceNode, nk: string, depth: number, leftX: number, cache: Map<string, number>): Placed {
  const w  = subtreeWidth(node, nk, cache);
  const cx = leftX + w / 2;
  const cy = PAD + NR + depth * VG;

  let cl = leftX;
  const children = node.children.map((child, i) => {
    const ck = `${nk}.${i}`;
    const cw = subtreeWidth(child, ck, cache);
    const p  = placeTree(child, ck, depth + 1, cl, cache);
    cl += cw;
    return p;
  });

  return { node, key: nk, cx, cy, children };
}

// ── Flatten ───────────────────────────────────────────────────────
function flatten(p: Placed, nodes: Placed[], edges: Edge[]) {
  nodes.push(p);
  for (const child of p.children) {
    // straight line: bottom center of parent → top center of child
    edges.push({ x1: p.cx, y1: p.cy + NR, x2: child.cx, y2: child.cy - NR });
    flatten(child, nodes, edges);
  }
}

function svgSize(placed: Placed): { w: number; h: number } {
  const nodes: Placed[] = [];
  flatten(placed, nodes, []);
  const maxX = Math.max(...nodes.map(n => n.cx + NR));
  const maxY = Math.max(...nodes.map(n => n.cy + NR));
  return { w: maxX + PAD, h: maxY + PAD };
}

// ── Component ─────────────────────────────────────────────────────
export default memo(function TreeViz({
  node, nodeCount, maxNodes, onReset,
}: {
  node: TraceNode; nodeCount: number; maxNodes: number; onReset: () => void;
}) {
  const cache    = new Map<string, number>();
  const placed   = placeTree(node, 'root', 0, PAD, cache);
  const allNodes: Placed[] = [];
  const edges:    Edge[]   = [];
  flatten(placed, allNodes, edges);
  const { w, h } = svgSize(placed);

  return (
    <div className="treeviz-canvas">
      {/* Fixed toolbar */}
      <div className="treeviz-toolbar">
        <span className="treeviz-count">
          {nodeCount} / {maxNodes} nodes
          {nodeCount >= maxNodes && <span className="treeviz-cap"> · cap reached</span>}
        </span>
        <button className="treeviz-reset-btn" onClick={onReset}>↺ Reset</button>
      </div>

      {/* Scrollable canvas */}
      <div className="treeviz-scroll">
        <svg width={w} height={h} style={{ display: 'block' }}>

          {/* Straight-line edges */}
          <g>
            {edges.map((e, i) => (
              <line key={i}
                x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                stroke="#1a2d42" strokeWidth={1}
              />
            ))}
          </g>

          {/* Circle nodes */}
          <g>
            {allNodes.map(({ node: n, cx, cy, key }) => {
              const isRoot  = key === 'root';
              const stroke  = isRoot ? ROOT_STROKE  : STROKE[n.type];
              const textClr = isRoot ? ROOT_TEXT     : TEXT_CLR[n.type];
              const sw      = isRoot ? 2.5 : 1.5;
              const top     = topLabel(n.label);
              const bot     = botLabel(n.label);
              const topY    = bot ? cy - 7 : cy;
              const botY    = cy + 8;

              return (
                <g key={key}>
                  <title>{n.label}</title>
                  <circle cx={cx} cy={cy} r={NR}
                    fill={NODE_BG} stroke={stroke} strokeWidth={sw}
                  />
                  <text x={cx} y={topY}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={bot ? 9 : 10}
                    fontFamily="'JetBrains Mono','Fira Code','Consolas',monospace"
                    fill={textClr}
                    style={{ userSelect: 'none' }}
                  >
                    {top}
                  </text>
                  {bot && (
                    <text x={cx} y={botY}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={8}
                      fontFamily="'JetBrains Mono','Fira Code','Consolas',monospace"
                      fill={textClr} opacity={0.65}
                      style={{ userSelect: 'none' }}
                    >
                      {bot}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

        </svg>
      </div>
    </div>
  );
});
