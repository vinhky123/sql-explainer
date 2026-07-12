import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import {
  Database, Filter, Group, Sigma, ArrowDownWideNarrow,
  Rows3, ArrowUpDown, ArrowDownToLine, Columns3, Braces,
} from 'lucide-react'
import type { FlowStep, RowDirection } from '@/lib/sql/executionOrder'

const directionMeta: Record<RowDirection, { label: string; color: string; icon: any }> = {
  resolve: { label: 'resolve tables', color: 'text-sky-400', icon: Database },
  narrows: { label: 'narrows rows', color: 'text-amber-400', icon: Filter },
  group: { label: 'groups rows', color: 'text-fuchsia-400', icon: Group },
  'filter-groups': { label: 'narrows groups', color: 'text-amber-400', icon: Filter },
  project: { label: 'projects columns', color: 'text-emerald-400', icon: Columns3 },
  distinct: { label: 'deduplicates', color: 'text-cyan-400', icon: Rows3 },
  reorders: { label: 'reorders rows', color: 'text-violet-400', icon: ArrowUpDown },
  limits: { label: 'limits rows', color: 'text-rose-400', icon: ArrowDownToLine },
}

const clauseIcon: Record<string, any> = {
  FROM: Database,
  WHERE: Filter,
  'GROUP BY': Group,
  HAVING: Filter,
  SELECT: Sigma,
  'SELECT DISTINCT': Sigma,
  DISTINCT: Rows3,
  'ORDER BY': ArrowUpDown,
  LIMIT: ArrowDownToLine,
  OFFSET: ArrowDownToLine,
}

export interface FlowNodeData {
  step: FlowStep
  active: boolean
  onHover: (offset: number, endOffset: number) => void
  onSelect: (offset: number, endOffset: number) => void
  [key: string]: unknown
}

function FlowNodeImpl({ data }: NodeProps) {
  const { step, active, onHover, onSelect } = data as FlowNodeData
  const meta = directionMeta[step.rowDirection]
  const Icon = clauseIcon[step.clause] ?? ArrowDownWideNarrow

  return (
    <div
      className={cn(
        'w-72 rounded-xl border bg-card/90 backdrop-blur transition-all',
        active ? 'border-primary shadow-lg shadow-primary/20 scale-[1.02]' : 'border-border hover:border-primary/40',
      )}
      onMouseEnter={() => onHover(step.startOffset, step.endOffset)}
      onMouseLeave={() => onHover(0, 0)}
      onClick={() => onSelect(step.startOffset, step.endOffset)}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-muted-foreground" />

      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
          {step.order}
        </span>
        {step.cte && (
          <span className="inline-flex items-center gap-1 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
            <Braces className="h-2.5 w-2.5" />
            {step.cte}
          </span>
        )}
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-sm font-semibold">{step.clause}</span>
        <span className={cn('ml-auto text-[10px] font-medium', meta.color)}>{meta.label}</span>
      </div>

      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground">{step.description}</p>

        <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-background/80 p-2 font-mono text-[11px] leading-relaxed text-foreground/90">
{step.snippet}
        </pre>

        {step.tables && step.tables.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {step.tables.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300">
                {t}
              </span>
            ))}
          </div>
        )}
        {step.columns && step.columns.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {step.columns.slice(0, 6).map((c, i) => (
              <span key={i} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {c}
              </span>
            ))}
            {step.columns.length > 6 && (
              <span className="text-[10px] text-muted-foreground">+{step.columns.length - 6}</span>
            )}
          </div>
        )}
        {step.aggregates && step.aggregates.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {step.aggregates.map((a, i) => (
              <span key={i} className="rounded bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] text-fuchsia-300">
                {a}
              </span>
            ))}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-muted-foreground" />
    </div>
  )
}

export const FlowNode = memo(FlowNodeImpl)
