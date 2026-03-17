import { memo, useState, useCallback } from 'react';
import type { TraceNode } from './engine/types';

// ── Layout constants ──────────────────────────────────────────────
const NW  = 200;  // node width
const NH  = 36;   // node height
const HG  = 24;   // horizontal gap between siblings
const VG  = 80;   // vertical gap between levels
const PAD = 24;   // canvas padding

// ── Node colour themes ────────────────────────────────────────────
const THEME: Record<TraceNode['type'], { bg: string; border: string; text: string; glow: string }> = {
  info:    { bg: '#131e2e', border: '#334155', text: '#94a3b8', glow: 'none'       },
  success: { bg: '#052e16', border: '#10b981', text: '#34d399', glow: '#10b98133' },
  warn:    { bg: '#2d1900', border: '#f59e0b', text: '#fbbf24', glow: '#f59e0b33' },
  action:  { bg: '#0c1e3d', border: '#3b82f6', text: '#60a5fa', glow: '#3b82f633' },
};

const DIMMED: Record<TraceNode['type'], { bg: string; border: string; text: string }> = {
  info:    { bg: '#0c1017', border: '#1e293b', text: '#334155' },
  success: { bg: '#020f08', border: '#134e26', text: '#1a5c38' },
  warn:    { bg: '#100900', border: '#78430a', text: '#7a4a00' },
  action:  { bg: '#050e1c', border: '#1d3560', text: '#1e3a6e' },
};

// ── Layout types ──────────────────────────────────────────────────
interface Placed {
  node: TraceNode;
  key: string;
  cx: number;
  ty: number;
  children: Placed[];
}

// ── Full-tree layout (always include every node) ──────────────────
function subtreeWidth(node: TraceNode, nodeKey: string, cache: Map<string, number>): number {
  if (cache.has(nodeKey)) return cache.get(nodeKey)!;
  let w: number;
  if (!node.children.length) {
    w = NW + HG;
  } else {
    w = node.children.reduce(
      (sum, child, i) => sum + subtreeWidth(child, `${nodeKey}.${i}`, cache), 0
    );
    w = Math.max(w, NW + HG);
  }
  cache.set(nodeKey, w);
  return w;
}

function placeTree(
  node: TraceNode,
  nodeKey: string,
  depth: number,
  leftX: number,
  cache: Map<string, number>
): Placed {
  const w  = subtreeWidth(node, nodeKey, cache);
  const cx = leftX + w / 2;
  const ty = PAD + depth * (NH + VG);

  const children: Placed[] = [];
  let childLeft = leftX;
  node.children.forEach((child, i) => {
    const childKey = `${nodeKey}.${i}`;
    const cw = subtreeWidth(child, childKey, cache);
    children.push(placeTree(child, childKey, depth + 1, childLeft, cache));
    childLeft += cw;
  });

  return { node, key: nodeKey, cx, ty, children };
}

// ── Flatten ───────────────────────────────────────────────────────
interface Edge { x1: number; y1: number; x2: number; y2: number; childKey: string }

function flatten(placed: Placed, nodes: Placed[], edges: Edge[]) {
  nodes.push(placed);
  for (const child of placed.children) {
    edges.push({ x1: placed.cx, y1: placed.ty + NH, x2: child.cx, y2: child.ty, childKey: child.key });
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

// ── Check whether a node-key is inside a dimmed subtree ───────────
function isDimmedKey(key: string, dimmed: Set<string>): boolean {
  // A node is dimmed if any ancestor's key is in the dimmed set
  for (const dk of dimmed) {
    if (key.startsWith(dk + '.')) return true;
  }
  return false;
}

// ── Single node renderer ──────────────────────────────────────────
function NodeRect({
  placed,
  dimmed,
  onToggle,
}: {
  placed: Placed;
  dimmed: Set<string>;
  onToggle: (key: string) => void;
}) {
  const { node, key, cx, ty } = placed;
  const selfDimmed = isDimmedKey(key, dimmed);
  const childrenDimmed = dimmed.has(key);           // this node's children are dimmed
  const hasChildren = node.children.length > 0;
  const x = cx - NW / 2;

  const theme  = selfDimmed ? DIMMED[node.type] : THEME[node.type];
  const opacity = selfDimmed ? 0.35 : 1;

  return (
    <g
      opacity={opacity}
      style={{ cursor: hasChildren ? 'pointer' : 'default' }}
      onClick={() => hasChildren && onToggle(key)}
    >
      {/* Glow (only when not dimmed) */}
      {!selfDimmed && THEME[node.type].glow !== 'none' && (
        <rect x={x - 3} y={ty - 3} width={NW + 6} height={NH + 6} rx={10} fill={THEME[node.type].glow} />
      )}

      {/* Body */}
      <rect
        x={x} y={ty} width={NW} height={NH} rx={7}
        fill={theme.bg}
        stroke={theme.border}
        strokeWidth={selfDimmed ? 1 : 1.5}
        strokeDasharray={selfDimmed ? '4 3' : 'none'}
      />

      {/* "Visited / dimmed" badge — strikethrough line on dimmed nodes */}
      {selfDimmed && (
        <line
          x1={x + 8} y1={ty + NH / 2}
          x2={x + NW - 8} y2={ty + NH / 2}
          stroke={theme.border} strokeWidth={1} opacity={0.6}
        />
      )}

      {/* Expand/collapse indicator */}
      {hasChildren && (
        <text
          x={x + NW - 11} y={ty + NH / 2}
          fontSize={9} fill={theme.border}
          textAnchor="middle" dominantBaseline="middle"
          style={{ userSelect: 'none' }}
        >
          {childrenDimmed ? '⊕' : '⊖'}
        </text>
      )}

      {/* Label */}
      <foreignObject x={x + 8} y={ty} width={NW - 26} height={NH}>
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
          title={node.label}
        >
          {node.label}
        </div>
      </foreignObject>
    </g>
  );
}

// ── Main component ────────────────────────────────────────────────
export default memo(function TreeViz({ node }: { node: TraceNode }) {
  // dimmed = set of parent keys whose children are faded (but still visible)
  const [dimmed, setDimmed] = useState<Set<string>>(new Set());

  const toggle = useCallback((key: string) => {
    setDimmed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Layout uses the full tree every time (no pruning)
  const cache  = new Map<string, number>();
  const placed = placeTree(node, 'root', 0, PAD, cache);
  const allNodes: Placed[] = [];
  const edges:    Edge[]   = [];
  flatten(placed, allNodes, edges);
  const { w, h } = treeSize(placed);

  return (
    <div className="treeviz-wrap">
      <svg width={w} height={h} style={{ display: 'block' }}>
        {/* Edges */}
        <g>
          {edges.map((e, i) => {
            const childDimmed = isDimmedKey(e.childKey, dimmed);
            const my = (e.y1 + e.y2) / 2;
            return (
              <path
                key={i}
                d={`M ${e.x1} ${e.y1} C ${e.x1} ${my}, ${e.x2} ${my}, ${e.x2} ${e.y2}`}
                fill="none"
                stroke={childDimmed ? '#1a2535' : '#1e3a5f'}
                strokeWidth={childDimmed ? 1 : 1.5}
                strokeDasharray={childDimmed ? '4 3' : 'none'}
                opacity={childDimmed ? 0.4 : 0.85}
              />
            );
          })}
        </g>
        {/* Nodes */}
        <g>
          {allNodes.map(p => (
            <NodeRect key={p.key} placed={p} dimmed={dimmed} onToggle={toggle} />
          ))}
        </g>
      </svg>
    </div>
  );
});
