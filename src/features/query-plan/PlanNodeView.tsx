import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Database, Search, GitMerge, Repeat, ArrowUpDown, Sigma,
  Hash, ArrowDownToLine, FileCode2, AlertTriangle, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanNodeData } from '@/lib/queryPlan/parsePlan'

export interface PlanNodeViewData {
  node: PlanNodeData
  flagged: boolean
  onSelect?: (id: string) => void
  [key: string]: unknown
}

function iconFor(nodeType: string): LucideIcon {
  const t = nodeType.toLowerCase()
  if (t.includes('seq scan')) return Database
  if (t.includes('index')) return Search
  if (t.includes('bitmap')) return Search
  if (t.includes('nested loop')) return Repeat
  if (t.includes('merge join')) return GitMerge
  if (t.includes('hash join')) return GitMerge
  if (t.includes('hash')) return Hash
  if (t.includes('sort')) return ArrowUpDown
  if (t.includes('aggregate') || t.includes('agg')) return Sigma
  if (t.includes('limit')) return ArrowDownToLine
  return FileCode2
}

function heatColor(share?: number): { bar: string; ring: string; text: string } {
  if (share == null) return { bar: 'bg-muted-foreground/40', ring: 'border-border', text: 'text-muted-foreground' }
  if (share >= 30) return { bar: 'bg-red-500', ring: 'border-red-500/50', text: 'text-red-400' }
  if (share >= 10) return { bar: 'bg-amber-500', ring: 'border-amber-500/40', text: 'text-amber-400' }
  return { bar: 'bg-emerald-500', ring: 'border-emerald-500/30', text: 'text-emerald-400' }
}

function fmt(v?: number): string {
  if (v == null) return '—'
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K'
  return Number.isInteger(v) ? v.toString() : v.toFixed(2)
}

function PlanNodeViewImpl({ data }: NodeProps) {
  const { node, flagged, onSelect } = data as PlanNodeViewData
  const Icon = iconFor(node.nodeType)
  const heat = heatColor(node.timeShare)
  const hasActual = node.actualTotalTime != null

  return (
    <div
      className={cn(
        'w-[280px] overflow-hidden rounded-lg border bg-card/95 backdrop-blur shadow-md transition-shadow',
        heat.ring,
        flagged && 'ring-2 ring-red-500/60 shadow-red-500/20',
      )}
      onClick={() => onSelect?.(node.id)}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground" />

      <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
        <span className={cn('absolute left-0 top-0 h-full w-1', heat.bar)} />
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate font-mono text-[12px] font-semibold text-foreground">{node.nodeType}</span>
        {node.relationName && (
          <span className="truncate font-mono text-[11px] text-sky-300">{node.relationName}</span>
        )}
        {flagged && <AlertTriangle className="ml-auto h-3.5 w-3.5 text-red-400" />}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 px-2.5 py-1.5 text-[10px]">
        <Metric label="rows" value={hasActual ? fmt(node.actualRows) : `~${fmt(node.planRows)}`} />
        <Metric label="cost" value={`${node.startupCost.toFixed(1)}..${node.totalCost.toFixed(1)}`} />
        {hasActual ? (
          <>
            <Metric label="actual" value={`${fmt(node.actualTotalTime)} ms`} />
            <Metric label="% self" value={node.timeShare != null ? `${node.timeShare.toFixed(1)}%` : '—'} accent={heat.text} />
          </>
        ) : (
          <>
            <Metric label="est. rows" value={fmt(node.planRows)} />
            <Metric label="width" value={String(node.planWidth)} />
          </>
        )}
      </div>

      {Object.keys(node.extra).length > 0 && (
        <div className="border-t border-border/40 px-2.5 py-1 font-mono text-[9.5px] leading-tight text-muted-foreground">
          {Object.entries(node.extra).slice(0, 2).map(([k, v]) => (
            <div key={k} className="truncate">
              <span className="text-foreground/70">{k}:</span> {v.length > 48 ? v.slice(0, 48) + '…' : v}
            </div>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground" />
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-mono font-medium', accent ?? 'text-foreground/90')}>{value}</span>
    </div>
  )
}

export const PlanNodeView = memo(PlanNodeViewImpl)
