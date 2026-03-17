import { memo, useState } from 'react';
import type { TraceNode } from './engine/types';

const TYPE_COLOR: Record<TraceNode['type'], string> = {
  info:    '#64748b',
  success: '#10b981',
  warn:    '#f59e0b',
  action:  '#3b82f6',
};

const TYPE_DOT: Record<TraceNode['type'], string> = {
  info:    '#334155',
  success: '#10b981',
  warn:    '#f59e0b',
  action:  '#3b82f6',
};

interface NodeProps {
  node: TraceNode;
  depth: number;
}

const TraceNodeView = memo(function TraceNodeView({ node, depth }: NodeProps) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div className="trace-row">
      <div
        className="trace-node"
        onClick={() => hasChildren && setOpen(o => !o)}
        style={{ cursor: hasChildren ? 'pointer' : 'default', paddingLeft: `${depth * 14}px` }}
      >
        <span
          className="trace-indicator"
          style={{ color: TYPE_COLOR[node.type] }}
        >
          {hasChildren ? (open ? '▾' : '▸') : '·'}
        </span>
        <span
          className="trace-dot"
          style={{ background: TYPE_DOT[node.type] }}
        />
        <span className="trace-label" style={{ color: TYPE_COLOR[node.type] }}>
          {node.label}
        </span>
      </div>

      {open && hasChildren && (
        <div className="trace-children" style={{ borderColor: '#1e293b' }}>
          {node.children.map((child, i) => (
            <TraceNodeView key={`${depth}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
});

export default function TraceTree({ node }: { node: TraceNode }) {
  return (
    <div className="trace-tree">
      <TraceNodeView node={node} depth={0} />
    </div>
  );
}
