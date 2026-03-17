import { memo, useState, useCallback } from 'react';
import type { TraceNode } from './engine/types';

// ── Layout constants ──────────────────────────────────────────────
const NW = 200;   // node width
const NH = 36;    // node height
const HG = 24;    // horizontal gap between siblings
const VG = 80;    // vertical gap between levels
const PAD = 24;   // canvas padding

// ── Node colour theme ─────────────────────────────────────────────
const THEME: Record<TraceNode['type'], { bg: string; border: string; text: string; glow: string }> = {
  info:    { bg: '#131e2e', border: '#334155', text: '#94a3b8', glow: 'none' },
  success: { bg: '#052e16', border: '#10b981', text: '#34d399', glow: '#10b98133' },
  warn:    { bg: '#2d1900', border: '#f59e0b', text: '#fbbf24', glow: '#f59e0b33' },
  action:  { bg: '#0c1e3d', border: '#3b82f6', text: '#60a5fa', glow: '#3b82f633' },
};

// ── Layout types ──────────────────────────────────────────────────
interface Placed {
  node: TraceNode;
  key: string;
  cx: number;   // centre x
  ty: number;   // top y
  children: Placed[];
}

// ── Width cache for a single layout pass ──────────────────────────
function subtreeWidth(
  node: TraceNode,
  nodeKey: string,
  expanded: Set<string>,
  cache: Map<string, number>
): number {
  if (cache.has(nodeKey)) return cache.get(nodeKey)!;
  const isOpen = expanded.has(nodeKey) && node.children.length > 0;
  let w: number;
  if (!isOpen) {
    w = NW + HG;
  } else {
    w = node.children.reduce((sum, child, i) =>
      sum + subtreeWidth(child, `${nodeKey}.${i}`, expanded, cache), 0);
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
  expanded: Set<string>,
  cache: Map<string, number>
): Placed {
  const w = subtreeWidth(node, nodeKey, expanded, cache);
  const cx = leftX + w / 2;
  const ty = PAD + depth * (NH + VG);
  const isOpen = expanded.has(nodeKey) && node.children.length > 0;

  const children: Placed[] = [];
  if (isOpen) {
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

// ── Flatten for rendering ─────────────────────────────────────────
interface Edge { x1: number; y1: number; x2: number; y2: number }

function flatten(placed: Placed, nodes: Placed[], edges: Edge[]) {
  nodes.push(placed);
  for (const child of placed.children) {
    edges.push({
      x1: placed.cx,
      y1: placed.ty + NH,
      x2: child.cx,
      y2: child.ty,
    });
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

// ── Node component ────────────────────────────────────────────────
function NodeRect({
  placed,
  expanded,
  onToggle,
}: {
  placed: Placed;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  const { node, key, cx, ty } = placed;
  const theme = THEME[node.type];
  const hasChildren = node.children.length > 0 || placed.node.children.length > 0;
  const isOpen = expanded.has(key);
  const x = cx - NW / 2;

  return (
    <g
      style={{ cursor: hasChildren ? 'pointer' : 'default' }}
      onClick={() => hasChildren && onToggle(key)}
    >
      {/* Glow */}
      {theme.glow !== 'none' && (
        <rect
          x={x - 2} y={ty - 2}
          width={NW + 4} height={NH + 4}
          rx={9} fill={theme.glow}
        />
      )}
      {/* Body */}
      <rect
        x={x} y={ty}
        width={NW} height={NH}
        rx={7}
        fill={theme.bg}
        stroke={theme.border}
        strokeWidth={1.5}
      />
      {/* Expand/collapse indicator */}
      {hasChildren && (
        <text
          x={x + NW - 12} y={ty + NH / 2 + 1}
          fontSize={9} fill={theme.border}
          textAnchor="middle" dominantBaseline="middle"
          style={{ userSelect: 'none' }}
        >
          {isOpen ? '▾' : '▸'}
        </text>
      )}
      {/* Label */}
      <foreignObject x={x + 8} y={ty} width={NW - 24} height={NH}>
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
interface Props { node: TraceNode }

export default memo(function TreeViz({ node }: Props) {
  // Default: expand root + its direct children
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    s.add('root');
    node.children.forEach((_, i) => s.add(`root.${i}`));
    return s;
  });

  const toggle = useCallback((key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const cache = new Map<string, number>();
  const placed = placeTree(node, 'root', 0, PAD, expanded, cache);
  const allNodes: Placed[] = [];
  const edges: Edge[] = [];
  flatten(placed, allNodes, edges);
  const { w, h } = treeSize(placed);

  return (
    <div className="treeviz-wrap">
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
                opacity={0.8}
              />
            );
          })}
        </g>
        {/* Nodes (rendered on top of edges) */}
        <g>
          {allNodes.map(p => (
            <NodeRect key={p.key} placed={p} expanded={expanded} onToggle={toggle} />
          ))}
        </g>
      </svg>
    </div>
  );
});
