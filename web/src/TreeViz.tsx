import { memo } from 'react';
import type { TraceNode } from './engine/types';

// ── Layout constants ──────────────────────────────────────────────
const NW  = 180;  // node width
const NH  = 36;   // node height
const HG  = 20;   // horizontal gap between siblings
const VG  = 70;   // vertical gap between levels
const PAD = 24;   // canvas padding

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

// ── Full-tree layout ──────────────────────────────────────────────
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
interface Edge { x1: number; y1: number; x2: number; y2: number }

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

// ── Single node renderer ──────────────────────────────────────────
function NodeRect({ placed }: { placed: Placed }) {
  const { node, cx, ty } = placed;
  const theme = THEME[node.type];
  const x = cx - NW / 2;

  return (
    <g>
      {/* Glow */}
      {theme.glow !== 'none' && (
        <rect x={x - 3} y={ty - 3} width={NW + 6} height={NH + 6} rx={10} fill={theme.glow} />
      )}

      {/* Body */}
      <rect x={x} y={ty} width={NW} height={NH} rx={7}
        fill={theme.bg} stroke={theme.border} strokeWidth={1.5}
      />

      {/* Label */}
      <foreignObject x={x + 8} y={ty} width={NW - 16} height={NH}>
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
          {allNodes.map(p => (
            <NodeRect key={p.key} placed={p} />
          ))}
        </g>
      </svg>
    </div>
  );
});
