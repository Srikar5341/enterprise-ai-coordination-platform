"use client";

/**
 * Reusable SVG dependency graph used by plan review, execution and recovery.
 * Pure SVG (no external graph lib) with M3 tonal nodes, animated edge drawing,
 * blocker pulsing and an accessible text alternative.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { TASK_STATUS_META } from "./primitives";
import type { TaskStatus } from "@/lib/api/types";

export interface DepNode {
  id: string;
  label: string;
  sublabel?: string;
  status: TaskStatus | "proposed" | "affected" | "highlight";
  x: number; // 0..100 normalized
  y: number; // 0..100 normalized
}

export interface DepEdge {
  from: string;
  to: string;
  animated?: boolean;
  highlighted?: boolean;
  dashed?: boolean;
}

interface DepGraphProps {
  nodes: DepNode[];
  edges: DepEdge[];
  height?: number;
  className?: string;
  onNodeClick?: (id: string) => void;
  drawEdges?: boolean; // animate stroke draw on mount
  legend?: boolean;
  compact?: boolean;
}

const NODE_FILL: Record<DepNode["status"], { fill: string; stroke: string; text: string }> = {
  todo: { fill: "var(--surface-container-high)", stroke: "var(--outline-variant)", text: "var(--foreground)" },
  proposed: { fill: "var(--tertiary-container)", stroke: "var(--tertiary)", text: "var(--on-tertiary-container)" },
  in_progress: { fill: "var(--secondary)", stroke: "var(--primary)", text: "var(--secondary-foreground)" },
  blocked: { fill: "var(--error-container)", stroke: "var(--error)", text: "var(--on-error-container)" },
  affected: { fill: "var(--warning-container)", stroke: "var(--warning)", text: "var(--on-warning-container)" },
  in_review: { fill: "var(--warning-container)", stroke: "var(--warning)", text: "var(--on-warning-container)" },
  highlight: { fill: "var(--info-container)", stroke: "var(--info)", text: "var(--on-info-container)" },
  done: { fill: "var(--success-container)", stroke: "var(--success)", text: "var(--on-success-container)" },
};

export function depGraphNodesFromTasks(
  tasks: { id: string; title: string; label?: string; status: TaskStatus; assigneeName?: string }[],
  deps: { fromTaskId: string; toTaskId: string }[]
): { nodes: DepNode[]; edges: DepEdge[] } {
  // Simple layered layout: tasks sorted by order; chain layout via depth
  const depth = new Map<string, number>();
  const depsByTask = new Map<string, string[]>();
  deps.forEach((d) => {
    depsByTask.set(d.toTaskId, [...(depsByTask.get(d.toTaskId) ?? []), d.fromTaskId]);
  });
  const resolveDepth = (id: string, guard = 0): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (guard > 20) return 0;
    const parents = depsByTask.get(id) ?? [];
    const d = parents.length ? Math.max(...parents.map((p) => resolveDepth(p, guard + 1))) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  tasks.forEach((t) => resolveDepth(t.id));
  const maxDepth = Math.max(0, ...tasks.map((t) => depth.get(t.id) ?? 0));
  const columns = new Map<number, string[]>();
  tasks.forEach((t) => {
    const d = depth.get(t.id) ?? 0;
    columns.set(d, [...(columns.get(d) ?? []), t.id]);
  });
  const nodes: DepNode[] = tasks.map((t) => {
    const d = depth.get(t.id) ?? 0;
    const col = columns.get(d) ?? [];
    const idx = col.indexOf(t.id);
    const x = maxDepth === 0 ? 50 : 12 + (d / maxDepth) * 76;
    const y = col.length === 1 ? 50 : 16 + (idx / (col.length - 1)) * 68;
    return { id: t.id, label: t.label ?? t.title, sublabel: t.assigneeName, status: t.status, x, y };
  });
  const edges: DepEdge[] = deps.map((d) => ({ from: d.fromTaskId, to: d.toTaskId }));
  return { nodes, edges };
}

export function DepGraph({ nodes, edges, height = 320, className, onNodeClick, drawEdges = true, legend = true, compact = false }: DepGraphProps) {
  const W = 100;
  const H = 100;
  const nodeById = React.useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const paths = React.useMemo(
    () =>
      edges
        .map((e) => {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + 8.5;
          const y1 = a.y;
          const x2 = b.x - 8.5;
          const y2 = b.y;
          const mx = (x1 + x2) / 2;
          const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
          return { ...e, d, key: `${e.from}->${e.to}` };
        })
        .filter(Boolean) as (DepEdge & { d: string; key: string })[],
    [edges, nodeById]
  );

  const interactive = !!onNodeClick;
  const nodeW = compact ? 15 : 17;
  const nodeH = compact ? 9 : 11;

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ height }}
        className="w-full"
        role="img"
        aria-label={`Dependency graph with ${nodes.length} tasks and ${edges.length} connections`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--outline)" />
          </marker>
          <marker id="dep-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--error)" />
          </marker>
        </defs>

        {paths.map((p) => (
          <path
            key={p.key}
            d={p.d}
            fill="none"
            stroke={p.highlighted ? "var(--error)" : "var(--outline)"}
            strokeWidth={p.highlighted ? 0.55 : 0.4}
            strokeDasharray={p.dashed ? "2 1.6" : p.highlighted ? "2 1.4" : undefined}
            markerEnd={p.highlighted ? "url(#dep-arrow-hot)" : "url(#dep-arrow)"}
            className={cn(
              p.animated && drawEdges && "animate-draw",
              p.animated && "animate-dash-flow"
            )}
            style={
              p.animated && drawEdges
                ? { strokeDasharray: "56 56", strokeDashoffset: 56, opacity: 0.95 }
                : undefined
            }
          >
            {p.animated && drawEdges ? null : null}
          </path>
        ))}

        {nodes.map((n) => {
          const colors = NODE_FILL[n.status] ?? NODE_FILL.todo;
          const isBlocked = n.status === "blocked";
          const clickable = interactive ? { onClick: () => onNodeClick?.(n.id), cursor: "pointer" as const, tabIndex: 0, role: "button" as const, onKeyDown: (ev: React.KeyboardEvent) => ev.key === "Enter" && onNodeClick?.(n.id) } : {};
          return (
            <g key={n.id} transform={`translate(${n.x}, ${n.y})`} {...clickable} className="transition-transform duration-200 ease-m3 hover:scale-[1.02]" focusable>
              {isBlocked && <circle r={nodeW * 0.62} fill="none" stroke="var(--error)" strokeWidth={0.3} className="animate-ping-soft" opacity={0.5} />}
              <rect
                x={-nodeW / 2} y={-nodeH / 2} width={nodeW} height={nodeH} rx={2.6}
                fill={colors.fill} stroke={colors.stroke} strokeWidth={n.status === "highlight" ? 0.5 : 0.35}
              />
              <circle cx={-nodeW / 2 + 2.6} cy={-nodeH / 2 + 2.6} r={1.05} fill={colors.stroke} />
              <title>{n.sublabel ? `${n.label} — ${n.sublabel}` : n.label}</title>
              <text
                x={0} y={n.sublabel ? -0.4 : 1.1}
                textAnchor="middle"
                fontSize={compact ? 2.6 : 2.8}
                fontWeight={600}
                fill={colors.text}
                style={{ pointerEvents: "none" }}
              >
                {n.label.length > (compact ? 10 : 12) ? `${n.label.slice(0, compact ? 9 : 11)}…` : n.label}
              </text>
              {n.sublabel && (
                <text x={0} y={nodeH / 2 - 2.2} textAnchor="middle" fontSize={2.2} fill={colors.text} opacity={0.75} style={{ pointerEvents: "none" }}>
                  {n.sublabel.length > (compact ? 10 : 12) ? `${n.sublabel.slice(0, compact ? 9 : 11)}…` : n.sublabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {legend && (
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-label-sm text-on-surface-variant" aria-label="Graph legend">
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: "var(--surface-container-high)", border: "1px solid var(--outline-variant)" }} /> To do</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: "var(--secondary)", border: "1px solid var(--primary)" }} /> In progress</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: "var(--error-container)", border: "1px solid var(--error)" }} /> Blocked</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: "var(--success-container)", border: "1px solid var(--success)" }} /> Done</li>
        </ul>
      )}

      {/* Accessible alternative for screen readers */}
      <table className="sr-only">
        <caption>Task dependency list</caption>
        <thead>
          <tr><th scope="col">Task</th><th scope="col">Status</th><th scope="col">Depends on</th></tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr key={n.id}>
              <td>{n.label}</td>
              <td>{TASK_STATUS_META[n.status as TaskStatus]?.label ?? n.status}</td>
              <td>{edges.filter((e) => e.to === n.id).map((e) => nodeById.get(e.from)?.label).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
