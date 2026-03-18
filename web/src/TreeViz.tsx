import { memo } from 'react';
import type { TraceNode } from './engine/types';

// ── Layout constants ──────────────────────────────────────────────
const NW  = 190;   // node width
const NH  = 36;    // node height
const HG  = 20;    // horizontal gap between siblings
const VG  = 55;    // vertical gap between levels  (≥40px as required)
const PAD = 32;    // canvas padding

// ── Colour themes ─────────────────────────────────────────────────
const THEME: Record<TraceNode['type'], { bg: string; border: string; text: string; glow: string }> = {
  info:    { bg: '#131e2e', border: '#334155', text: '#94a3b8', glow: 'none'       },
  success: { bg: '#052e16', border: '#10b981', text: '#34d399', glow: '#10b98133' },
  warn:    { bg: '#2d1900', border: '#f59e0b', text: '#fbbf24', glow: '#f59e0b33' },
  action:  { bg: '#0c1e3d', border: '#3b82f6', text: '#60a5fa', glow: '#3b82f633' },
  death:   { bg: '#1f0000', border: '#ef4444', text: '#f87171', glow: '#ef444433' },
};

// ── Layout types ──────────────────────────────────────────────────
interface Placed { node: TraceNode; key: string; cx: number; ty: number; children: Placed[] }
interface Edge   { x1: number; y1: number; x2: number; y2: number }

// ── Reingold-Tilford width / placement (full tree — no collapse) ──
function subtreeWidth(node: TraceNode, nodeKey: string, cache: Map<string, number>): number {
  if (cache.has(nodeKey)) return cache.get(nodeKey)!;
  const w = node.children.length === 0
    ? NW + HG
    : Math.max(
        node.children.reduce((s, c, i) => s + subtreeWidth(c, `${nodeKey}.${i}`, cache), 0),
        NW + HG
      );
  cache.set(nodeKey, w);
  return w;
}

function placeTree(node: TraceNode, nodeKey: string, depth: number, leftX: number, cache: Map<string, number>): Placed {
  const w  = subtreeWidth(node, nodeKey, cache);
  const cx = leftX + w / 2;
  const ty = PAD + depth * (NH + VG);

  let childLeft = leftX;
  const children = node.children.map((child, i) => {
    const childKey = `${nodeKey}.${i}`;
    const cw = subtreeWidth(child, childKey, cache);
    const placed = placeTree(child, childKey, depth + 1, childLeft, cache);
    childLeft += cw;
    return placed;
  });

  return { node, key: nodeKey, cx, ty, children };
}

function flatten(placed: Placed, nodes: Placed[], edges: Edge[]) {
  nodes.push(placed);
  for (const child of placed.children) {
    edges.push({ x1: placed.cx, y1: placed.ty + NH, x2: child.cx, y2: child.ty });
    flatten(child, nodes, edges);
  }
}

function treeSize(placed: Placed): { w: number; h: number } {
  const nodes: Placed[] = [];
  flatten(placed, nodes, []);
  const maxX = Math.max(...nodes.map(n => n.cx + NW / 2));
  const maxY = Math.max(...nodes.map(n => n.ty + NH));
  return { w: maxX + PAD, h: maxY + PAD };
}

// ── Component (no interaction state — always fully expanded) ──────
export default memo(function TreeViz({
  node,
  nodeCount,
  maxNodes,
  onReset,
}: {
  node: TraceNode;
  nodeCount: number;
  maxNodes: number;
  onReset: () => void;
}) {
  const cache    = new Map<string, number>();
  const placed   = placeTree(node, 'root', 0, PAD, cache);
  const allNodes: Placed[] = [];
  const edges:    Edge[]   = [];
  flatten(placed, allNodes, edges);
  const { w, h } = treeSize(placed);

  return (
    <div className="treeviz-canvas">
      {/* Toolbar — fixed, never scrolls */}
      <div className="treeviz-toolbar">
        <span className="treeviz-count">
          {nodeCount} / {maxNodes} nodes
          {nodeCount >= maxNodes && <span className="treeviz-cap"> · cap reached</span>}
        </span>
        <button className="treeviz-reset-btn" onClick={onReset}>↺ Reset</button>
      </div>

      {/* Scrollable canvas — tree grows freely here */}
      <div className="treeviz-scroll">
        <svg width={w} height={h} style={{ display: 'block' }}>

          {/* Curved edges */}
          <g>
            {edges.map((e, i) => {
              const my = (e.y1 + e.y2) / 2;
              return (
                <path
                  key={i}
                  d={`M ${e.x1} ${e.y1} C ${e.x1} ${my}, ${e.x2} ${my}, ${e.x2} ${e.y2}`}
                  fill="none" stroke="#1e3a5f" strokeWidth={1.5} opacity={0.8}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {allNodes.map(({ node: n, cx, ty, key }) => {
              const theme = THEME[n.type];
              const x = cx - NW / 2;
              return (
                <g key={key}>
                  {theme.glow !== 'none' && (
                    <rect x={x-3} y={ty-3} width={NW+6} height={NH+6} rx={10} fill={theme.glow} />
                  )}
                  <rect x={x} y={ty} width={NW} height={NH} rx={7}
                    fill={theme.bg} stroke={theme.border} strokeWidth={1.5}
                  />
                  <foreignObject x={x+8} y={ty} width={NW-16} height={NH}>
                    <div
                      style={{
                        height: NH, display: 'flex', alignItems: 'center',
                        fontSize: '10px',
                        fontFamily: "'JetBrains Mono','Fira Code','Consolas',monospace",
                        color: theme.text, overflow: 'hidden',
                        whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}
                      title={n.label}
                    >
                      {n.label}
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </g>

        </svg>
      </div>
    </div>
  );
});
