import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SqlEditor } from '@/components/editor/SqlEditor'
import { Select } from '@/components/ui/select'
import { useSqlStore } from '@/store/sqlStore'
import { DIALECTS } from '@/types'
import { parseSql } from '@/lib/sql/parser'
import { CheckCircle2, AlertCircle, Eraser, Wand2, Workflow, Network, Gauge, Sparkles, Braces } from 'lucide-react'

const TOOL_LINKS = [
  { to: '/format', icon: Wand2, label: 'Format' },
  { to: '/execution-flow', icon: Workflow, label: 'Execution flow' },
  { to: '/erd', icon: Network, label: 'ERD / Schema' },
  { to: '/optimize', icon: Gauge, label: 'Optimize' },
  { to: '/ai', icon: Sparkles, label: 'AI explain' },
]

interface WorkbenchProps {
  rightPanel: React.ReactNode
  toolbar?: React.ReactNode
}

export function Workbench({ rightPanel, toolbar }: WorkbenchProps) {
  const { sql, dialect, setDialect, clear } = useSqlStore()
  const parse = useMemo(() => parseSql(sql, dialect), [sql, dialect])
  const location = useLocation()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2" role="toolbar" aria-label="SQL editor toolbar">
        <Select
          value={dialect}
          onChange={(e) => setDialect(e.target.value as any)}
          className="w-44"
          aria-label="SQL dialect"
        >
          {['Popular', 'Enterprise', 'Analytics', 'Streaming'].map((group) => (
            <optgroup key={group} label={group}>
              {DIALECTS.filter((d) => d.group === group).map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <div className="flex items-center gap-1.5 text-xs">
          {parse.ok ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-muted-foreground">Valid</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-amber-400">Syntax error</span>
            </>
          )}
        </div>
        {parse.jinja?.detected && (
          <div className="flex items-center gap-1 rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[11px] font-medium text-indigo-300" title={`dbt/Jinja detected${parse.jinja.refs.length ? ` — refs: ${parse.jinja.refs.join(', ')}` : ''}`}>
            <Braces className="h-3 w-3" />
            dbt
          </div>
        )}
        <div className="flex items-center gap-0.5" role="toolbar" aria-label="Tool navigation">
          {TOOL_LINKS.filter((l) => l.to !== location.pathname).map((l) => (
            <Link
              key={l.to}
              to={l.to}
              aria-label={l.label}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
            >
              <l.icon className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
        <div className="flex-1" />
        {toolbar}
        <button
          onClick={clear}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          aria-label="Clear editor"
        >
          <Eraser className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>
      {parse.error && parse.error.message && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
          {parse.error.line && (
            <span className="font-mono mr-2">L{parse.error.line}:{parse.error.column ?? '?'}</span>
          )}
          {parse.error.message}
        </div>
      )}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-2 overflow-hidden">
        <div className="border-r border-border/60 min-h-0">
          <SqlEditor error={parse.error} />
        </div>
        <div className="overflow-auto min-h-0">{rightPanel}</div>
      </div>
    </div>
  )
}
