import { memo, useState, useCallback } from 'react';
import type { TraceNode } from './engine/types';

// ── Layout constants ──────────────────────────────────────────────
const NW  = 190;   // node width
const NH  = 36;    // node height
const HG  = 40;    // horizontal gap between siblings
const VG  = 70;    // vertical gap between levels
const PAD = 32;    // canvas padding
const MAX_NODES = 100;

// ── Node colour themes ────────────────────────────────────────────
const THEME: Record<TraceNode['type'], { bg: string; border: string; text: string; glow: string }> = {
  info:    { bg: '#131e2e', border: '#334155', text: '#94a3b8', glow: 'none'       },
  success: { bg: '#052e16', border: '#10b981', text: '#34d399', glow: '#10b98133' },
  warn:    { bg: '#2d1900', border: '#f59e0b', text: '#fbbf24', glow: '#f59e0b33' },
  action:  { bg: '#0c1e3d', border: '#3b82f6', text: '#60a5fa', glow: '#3b82f633' },
  death:   { bg: '#1f0000', border: '#ef4444', text: '#f87171', glow: '#ef444433' },
};

// ── Layout types ──────────────────────────────────────────────────
interface Placed {
  node: TraceNode;
  key: string;
  cx: number;
  ty: number;
  children: Placed[];
}

interface Edge { x1: number; y1: number; x2: number; y2: number }

// ── Width calculation — only counts expanded subtrees ─────────────
function subtreeWidth(
  node: TraceNode,
  nodeKey: string,
  expanded: Set<string>,
  cache: Map<string, number>
): number {
  if (cache.has(nodeKey)) return cache.get(nodeKey)!;
  let w: number;
  if (!node.children.length || !expanded.has(nodeKey)) {
    w = NW + HG;
  } else {
    w = node.children.reduce(
      (sum, child, i) => sum + subtreeWidth(child, `${nodeKey}.${i}`, expanded, cache), 0
    );
    w = Math.max(w, NW + HG);
  }
  cache.set(nodeKey, w);
  return w;
}

// ── Place only expanded nodes ─────────────────────────────────────
function placeTree(
  node: TraceNode,
  nodeKey: string,
  depth: number,
  leftX: number,
  expanded: Set<string>,
  cache: Map<string, number>
): Placed {
  const w  = subtreeWidth(node, nodeKey, expanded, cache);
  const cx = leftX + w / 2;
  const ty = PAD + depth * (NH + VG);

  const children: Placed[] = [];
  if (expanded.has(nodeKey) && node.children.length > 0) {
    let childLeft = leftX;
    node.children.forEach((child, i) => {
      const childKey = `${nodeKey}.${i}`;
      const cw = subtreeWidth(child, childKey, expanded, cache);
      children.push(placeTree(child, childKey, depth + 1, childLeft, expanded, cache));
      childLeft += cw;
    });
  }

  return { node, key: nodeKey, cx, ty, children };
}

// ── Flatten tree into node + edge lists ───────────────────────────
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

// ── Count nodes that would be visible if a key is expanded ────────
function countVisible(placed: Placed): number {
  return 1 + placed.children.reduce((sum, c) => sum + countVisible(c), 0);
}

// ── Main component ────────────────────────────────────────────────
export default memo(function TreeViz({ node }: { node: TraceNode }) {
  // Root starts expanded so first-level children are immediately visible
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['root']));
  const [nodeCount, setNodeCount] = useState<number>(() => 1 + node.children.length);

  const handleReset = useCallback(() => {
    setExpanded(new Set(['root']));
    setNodeCount(1 + node.children.length);
  }, [node]);

  const handleClick = useCallback((placed: Placed) => {
    const { key, node: n } = placed;
    if (expanded.has(key) || !n.children.length) return;
    const toAdd = n.children.length;
    if (nodeCount + toAdd > MAX_NODES) return;
    setExpanded(prev => new Set([...prev, key]));
    setNodeCount(prev => prev + toAdd);
  }, [expanded, nodeCount]);

  const cache    = new Map<string, number>();
  const placed   = placeTree(node, 'root', 0, PAD, expanded, cache);
  const allNodes: Placed[] = [];
  const edges:    Edge[]   = [];
  flatten(placed, allNodes, edges);
  const { w, h } = treeSize(placed);
  const visible  = countVisible(placed);

  return (
    <div className="treeviz-canvas">
      {/* Top-right controls */}
      <div className="treeviz-toolbar">
        <span className="treeviz-count">{visible} / {MAX_NODES} nodes</span>
        <button className="treeviz-reset-btn" onClick={handleReset}>↺ Reset view</button>
      </div>

      {/* Scrollable SVG canvas */}
      <div className="treeviz-scroll">
        <svg width={w} height={h} style={{ display: 'block' }}>
          {/* Edges */}
          <g>
            {edges.map((e, i) => {
              const my = (e.y1 + e.y2) / 2;
              return (
                <path
                  key={i}
                  d={`M ${e.x1} ${e.y1} C ${e.x1} ${my}, ${e.x2} ${my}, ${e.x2} ${e.y2}`}
                  fill="none"
                  stroke="#1e3a5f"
                  strokeWidth={1.5}
                  opacity={0.85}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {allNodes.map(p => {
              const { node: n, cx, ty, key } = p;
              const theme      = THEME[n.type];
              const x          = cx - NW / 2;
              const isExpanded = expanded.has(key);
              const hasKids    = n.children.length > 0;
              const canExpand  = !isExpanded && hasKids && nodeCount + n.children.length <= MAX_NODES;
              const atCap      = !isExpanded && hasKids && nodeCount + n.children.length > MAX_NODES;

              return (
                <g
                  key={key}
                  style={{ cursor: canExpand ? 'pointer' : 'default' }}
                  onClick={() => canExpand && handleClick(p)}
                >
                  {/* Glow */}
                  {theme.glow !== 'none' && (
                    <rect x={x - 3} y={ty - 3} width={NW + 6} height={NH + 6} rx={10} fill={theme.glow} />
                  )}

                  {/* Hover highlight for expandable */}
                  {canExpand && (
                    <rect x={x - 2} y={ty - 2} width={NW + 4} height={NH + 4} rx={9}
                      fill="none" stroke="#60a5fa" strokeWidth={1} opacity={0.4}
                      strokeDasharray="4 3"
                    />
                  )}

                  {/* Body */}
                  <rect
                    x={x} y={ty} width={NW} height={NH} rx={7}
                    fill={theme.bg}
                    stroke={theme.border}
                    strokeWidth={1.5}
                  />

                  {/* Expand badge */}
                  {canExpand && (
                    <circle cx={x + NW - 10} cy={ty + NH / 2} r={7} fill="#1d3a6e" stroke="#3b82f6" strokeWidth={1} />
                  )}
                  {canExpand && (
                    <text x={x + NW - 10} y={ty + NH / 2} textAnchor="middle" dominantBaseline="middle"
                      fontSize={10} fill="#60a5fa" style={{ userSelect: 'none' }}>+</text>
                  )}

                  {/* At-cap indicator */}
                  {atCap && (
                    <text x={x + NW - 10} y={ty + NH / 2} textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fill="#475569" style={{ userSelect: 'none' }}>…</text>
                  )}

                  {/* Label */}
                  <foreignObject x={x + 8} y={ty} width={NW - (canExpand || atCap ? 30 : 16)} height={NH}>
                    <div
                      style={{
                        height: NH,
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '10px',
                        fontFamily: "'JetBrains Mono','Fira Code','Consolas',monospace",
                        color: theme.text,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
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
