import { motion, AnimatePresence } from 'framer-motion'
import {
  Database, Filter, Group, Sigma, ArrowUpDown, ArrowDownToLine, Rows3, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FlowStep } from '@/lib/sql/executionOrder'
import type { TableSnapshot } from '@/lib/sql/dataTransform'

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

const numericKinds = new Set(['id', 'ref', 'count', 'age'])

interface Props {
  steps: FlowStep[]
  snapshots: TableSnapshot[]
  activeIdx: number
  onStepClick: (i: number) => void
}

export function DataPreview({ steps, snapshots, activeIdx, onStepClick }: Props) {
  const idx = Math.max(0, Math.min(activeIdx, snapshots.length - 1))
  const snap = snapshots[idx]
  const step = steps[idx]
  const colCount = snap.columns.length
  const gridCols = `2rem repeat(${colCount}, minmax(5.5rem, 1fr))`
  const Icon = clauseIcon[step.clause] ?? Sigma

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 overflow-x-auto border-b border-border/60 px-2 py-1.5">
        {steps.map((s, i) => {
          const SIcon = clauseIcon[s.clause] ?? Sigma
          const active = i === idx
          return (
            <button
              key={s.id}
              onClick={() => onStepClick(i)}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
                active
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px]',
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/30',
                )}
              >
                {i + 1}
              </span>
              <SIcon className="h-3 w-3" />
              {s.clause}
            </button>
          )
        })}
      </div>

      <div className="border-b border-border/60 bg-primary/5 px-3 py-1.5 text-xs">
        <Icon className="mr-1 inline h-3 w-3 text-primary" />
        <span className="font-mono text-primary">Step {idx + 1}/{steps.length}:</span>{' '}
        <span className="font-medium text-foreground">{step.clause}</span>
        <span className="text-muted-foreground"> — {step.description}</span>
        <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-foreground">{snap.badge}</span>
      </div>

      <div className="flex-1 overflow-auto p-2">
        <div className="overflow-hidden rounded-lg border border-border/60 bg-card/40">
          <div
            className="grid sticky top-0 z-10 border-b border-border/60 bg-muted/50 backdrop-blur"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="px-1 py-1.5 text-[9px] text-muted-foreground">#</div>
            {snap.columns.map((c, i) => (
              <div
                key={i}
                className={cn(
                  'truncate px-2 py-1.5 text-[11px] font-semibold',
                  c.dimmed
                    ? 'text-muted-foreground/40 line-through'
                    : c.highlighted
                      ? 'text-primary'
                      : 'text-foreground',
                )}
                title={c.label}
              >
                {c.isAgg && <Sigma className="mr-0.5 inline h-2.5 w-2.5" />}
                {c.label}
              </div>
            ))}
          </div>

          <AnimatePresence initial={false}>
            {snap.rows.map((row, i) => (
              <motion.div
                key={row.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: row.dimmed ? 0.28 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ layout: { duration: 0.4, ease: 'easeInOut' }, opacity: { duration: 0.2 } }}
                className={cn(
                  'grid border-b border-border/20 last:border-0',
                  row.dimmed && 'bg-red-500/5',
                )}
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="flex items-center justify-center px-1 py-1 text-[9px] text-muted-foreground">
                  <span className={cn(row.dimmed && 'line-through')}>{i + 1}</span>
                </div>
                {row.cells.map((cell, j) => {
                  const col = snap.columns[j]
                  return (
                    <div
                      key={j}
                      className={cn(
                        'truncate px-2 py-1 font-mono text-[11px]',
                        col.dimmed
                          ? 'text-muted-foreground/40 line-through'
                          : col.kind === 'money'
                            ? 'text-emerald-300'
                            : numericKinds.has(col.kind)
                              ? 'text-sky-300'
                              : col.kind === 'boolean'
                                ? 'text-amber-300'
                                : col.kind === 'date'
                                  ? 'text-violet-300'
                                  : 'text-foreground/90',
                      )}
                      title={cell}
                    >
                      {row.groupSize != null && j === 0 && (
                        <span className="mr-1 rounded bg-fuchsia-500/15 px-1 text-[9px] text-fuchsia-300">
                          ×{row.groupSize}
                        </span>
                      )}
                      {cell}
                    </div>
                  )
                })}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {snap.grouped && (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Info className="h-3 w-3" />
            Rows collapsed into groups — aggregates shown in SELECT.
          </p>
        )}
      </div>

      <div className="border-t border-border/60 px-3 py-1 text-[10px] text-muted-foreground">
        Sample data — illustrative only, not your actual rows.
      </div>
    </div>
  )
}
