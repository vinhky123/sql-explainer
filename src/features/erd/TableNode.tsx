import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Table2, KeyRound, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HEADER_HEIGHT, ROW_HEIGHT } from './erdLayout'
import type { ErdTable } from '@/lib/sql/erdExtractor'

export interface TableNodeData {
  table: ErdTable
  columnCount: number
  highlightColumn?: string | null
  onColumnHover?: (table: string, column: string | null) => void
  source: 'ddl' | 'select'
  [key: string]: unknown
}

function handleTop(index: number): number {
  return HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2
}

function TableNodeImpl({ data }: NodeProps) {
  const { table, highlightColumn, onColumnHover, source } = data as TableNodeData

  return (
    <div
      className={cn(
        'w-[260px] overflow-hidden rounded-lg border bg-card/95 backdrop-blur shadow-lg',
        source === 'select' ? 'border-sky-500/40' : 'border-border',
      )}
    >
      <div
        className="flex items-center gap-2 border-b border-border/70 bg-secondary/40 px-2.5"
        style={{ height: HEADER_HEIGHT }}
      >
        <Table2 className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate font-mono text-[13px] font-semibold text-foreground">{table.name}</span>
        {source === 'select' && (
          <span className="ml-auto rounded bg-sky-500/15 px-1 text-[9px] font-medium text-sky-300">ref</span>
        )}
      </div>

      <div className="py-1">
        {table.columns.length === 0 && (
          <div className="px-2.5 py-1.5 text-[11px] italic text-muted-foreground">no columns detected</div>
        )}
        {table.columns.map((col, i) => {
          const active = highlightColumn === col.name
          return (
            <div
              key={col.name + i}
              className={cn(
                'relative flex items-center gap-1.5 px-2.5 transition-colors',
                active ? 'bg-primary/15' : 'hover:bg-secondary/50',
              )}
              style={{ height: ROW_HEIGHT }}
              onMouseEnter={() => onColumnHover?.(table.name, col.name)}
              onMouseLeave={() => onColumnHover?.(table.name, null)}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={col.name}
                style={{ top: handleTop(i), opacity: 0, width: 1, height: 1 }}
              />
              <Handle
                type="source"
                position={Position.Right}
                id={col.name}
                style={{ top: handleTop(i), opacity: 0, width: 1, height: 1 }}
              />

              {col.primaryKey ? (
                <KeyRound className="h-3 w-3 shrink-0 text-amber-400" />
              ) : col.unique ? (
                <Link2 className="h-3 w-3 shrink-0 text-cyan-400" />
              ) : (
                <span className="h-3 w-3 shrink-0" />
              )}

              <span
                className={cn(
                  'truncate font-mono text-[11px]',
                  col.primaryKey ? 'font-semibold text-amber-200' : 'text-foreground/90',
                )}
              >
                {col.name}
              </span>
              <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-muted-foreground">
                {col.dataType}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const TableNode = memo(TableNodeImpl)
