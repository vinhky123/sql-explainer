import { useMemo, useCallback } from 'react'
import { useSqlStore } from '@/store/sqlStore'
import { useEditorStore } from '@/store/editorStore'
import { parseSql } from '@/lib/sql/parser'
import { runHeuristics } from '@/lib/heuristics/rules'
import type { Finding } from '@/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Gauge, AlertCircle, AlertTriangle, Info, CheckCircle2, Sparkles, Wand2,
} from 'lucide-react'

const sevMeta = {
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Critical' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'Warning' },
  info: { icon: Info, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30', label: 'Info' },
}
const order = ['critical', 'warning', 'info'] as const

function FindingCard({ finding, onSelect, onApply }: {
  finding: Finding
  onSelect: (f: Finding) => void
  onApply: (f: Finding) => void
}) {
  const m = sevMeta[finding.severity]
  const Icon = m.icon
  const canHighlight = finding.startOffset != null && finding.endOffset != null
  const canApply = finding.rewrite !== undefined && finding.snippet != null

  return (
    <div
      className={cn(
        'rounded-lg border p-2.5 transition-colors',
        m.bg, m.border,
        canHighlight ? 'cursor-pointer hover:bg-secondary/60' : '',
      )}
      onClick={() => onSelect(finding)}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', m.color)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{m.label}</span>
            {canApply && <Sparkles className="h-3 w-3 text-emerald-400" />}
          </div>
          <p className="text-sm font-medium text-foreground">{finding.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{finding.explanation}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">
            <span className="font-medium text-primary">Fix: </span>{finding.suggestion}
          </p>
          {finding.snippet && (
            <pre className="mt-1.5 overflow-auto rounded bg-background/60 p-1.5 font-mono text-[10.5px] text-foreground/70">
{finding.snippet}
            </pre>
          )}
          {canApply && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 gap-1.5 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
              onClick={(e) => { e.stopPropagation(); onApply(finding) }}
            >
              <Wand2 className="h-3 w-3" />
              Apply fix
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function OptimizerPanel() {
  const { sql, dialect, setSql } = useSqlStore()
  const highlight = useEditorStore((s) => s.highlight)
  const clearHighlight = useEditorStore((s) => s.clearHighlight)

  const parse = useMemo(() => parseSql(sql, dialect), [sql, dialect])
  const findings = useMemo(() => runHeuristics(sql, parse.ast), [sql, parse.ast])
  const sorted = useMemo(() => [...findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)), [findings])

  const counts = useMemo(() => ({
    critical: findings.filter((f) => f.severity === 'critical').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  }), [findings])

  const handleSelect = useCallback((f: Finding) => {
    if (f.startOffset != null && f.endOffset != null) highlight(f.startOffset, f.endOffset)
    else clearHighlight()
  }, [highlight, clearHighlight])

  const handleApply = useCallback((f: Finding) => {
    if (f.snippet == null || f.rewrite === undefined) return
    const next = sql.replace(f.snippet, f.rewrite)
    setSql(next)
  }, [sql, setSql])

  if (!sql.trim()) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Gauge className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Paste a SELECT query to run heuristic optimization checks.</p>
      </div>
    )
  }

  if (!parse.ok) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircle className="h-8 w-8 text-amber-400" />
        <p className="text-sm text-muted-foreground">Fix the syntax error to run the optimizer.</p>
      </div>
    )
  }

  const hasSelect = Array.isArray(parse.ast) && parse.ast.some((s: any) => s?.type === 'select')
  if (!hasSelect) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Gauge className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">The optimizer analyzes SELECT statements. Paste a SELECT to begin.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <Gauge className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">Heuristic optimizer</span>
        <span className="text-xs text-muted-foreground">{findings.length} findings</span>
        {counts.critical > 0 && <SevBadge n={counts.critical} k="critical" />}
        {counts.warning > 0 && <SevBadge n={counts.warning} k="warning" />}
        {counts.info > 0 && <SevBadge n={counts.info} k="info" />}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">click a finding to highlight</span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          <p className="text-sm text-muted-foreground">No issues detected — this query looks clean.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-2.5">
          <div className="space-y-2">
            {sorted.map((f, i) => (
              <FindingCard key={`${f.id}-${i}`} finding={f} onSelect={handleSelect} onApply={handleApply} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SevBadge({ n, k }: { n: number; k: keyof typeof sevMeta }) {
  const m = sevMeta[k]
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', m.bg, m.color)}>
      {n} {m.label.toLowerCase()}
    </span>
  )
}
