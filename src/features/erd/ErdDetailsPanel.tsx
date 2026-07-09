import { useEffect, useRef } from 'react'
import { X, KeyRound, Link2, ArrowRight, Table2, Hash, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ErdModel, ErdTable, ErdRelationship } from '@/lib/sql/erdExtractor'

interface Props {
  table: ErdTable | null
  relationship: ErdRelationship | null
  model: ErdModel
  onClose: () => void
}

export function ErdDetailsPanel({ table, relationship, model, onClose }: Props) {
  const open = !!table || !!relationship
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const closeBtn = panel.querySelector<HTMLButtonElement>('button[title="Close"]')
    closeBtn?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Tab') {
        const focusable = panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className="absolute inset-0 z-10 bg-background/40" onClick={onClose} />
      <div ref={panelRef} className="absolute right-0 top-0 bottom-0 z-20 flex w-72 flex-col border-l border-border/60 bg-card/95 backdrop-blur shadow-xl" role="dialog" aria-modal="true" aria-label="Details panel">
        {table && <TableDetails table={table} model={model} onClose={onClose} />}
        {relationship && !table && <RelationshipDetails rel={relationship} onClose={onClose} />}
      </div>
    </>
  )
}

function TableDetails({ table, model, onClose }: { table: ErdTable; model: ErdModel; onClose: () => void }) {
  const indexes = model.indexes.filter((i) => i.table === table.name)
  const incoming = model.relationships.filter((r) => r.toTable === table.name)
  const outgoing = model.relationships.filter((r) => r.fromTable === table.name)

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Table2 className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-sm font-semibold">{table.name}</span>
        <span className={cn('ml-auto rounded px-1 text-[9px] font-medium', table.source === 'select' ? 'bg-sky-500/15 text-sky-300' : 'bg-secondary text-muted-foreground')}>
          {table.source}
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" title="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <Section title={`Columns (${table.columns.length})`}>
          {table.columns.length === 0 ? (
            <p className="text-[11px] italic text-muted-foreground">none detected</p>
          ) : (
            table.columns.map((c) => (
              <div key={c.name} className="flex items-center gap-1.5 py-0.5">
                {c.primaryKey ? (
                  <KeyRound className="h-3 w-3 shrink-0 text-amber-400" />
                ) : c.unique ? (
                  <Link2 className="h-3 w-3 shrink-0 text-cyan-400" />
                ) : (
                  <span className="h-3 w-3 shrink-0" />
                )}
                <span className={cn('truncate font-mono text-[11px]', c.primaryKey ? 'font-semibold text-amber-200' : 'text-foreground/90')}>
                  {c.name}
                </span>
                {c.dataType && (
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{c.dataType}</span>
                )}
                {!c.nullable && !c.primaryKey && (
                  <span className="shrink-0 rounded bg-secondary px-1 text-[9px] text-muted-foreground">NN</span>
                )}
                {c.defaultValue != null && c.defaultValue !== '' && (
                  <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70">={c.defaultValue}</span>
                )}
              </div>
            ))
          )}
        </Section>

        {indexes.length > 0 && (
          <Section title={`Indexes (${indexes.length})`}>
            {indexes.map((idx) => (
              <div key={idx.name} className="flex items-center gap-1.5 py-0.5">
                <Hash className={cn('h-3 w-3 shrink-0', idx.unique ? 'text-cyan-400' : 'text-muted-foreground')} />
                <span className="truncate font-mono text-[11px] text-foreground/90">{idx.name}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                  ({idx.columns.join(', ')})
                </span>
              </div>
            ))}
          </Section>
        )}

        {outgoing.length > 0 && (
          <Section title={`Outgoing (${outgoing.length})`}>
            {outgoing.map((r) => (
              <RelRow key={r.id} rel={r} dir="out" />
            ))}
          </Section>
        )}

        {incoming.length > 0 && (
          <Section title={`Incoming (${incoming.length})`}>
            {incoming.map((r) => (
              <RelRow key={r.id} rel={r} dir="in" />
            ))}
          </Section>
        )}
      </div>
    </>
  )
}

function RelationshipDetails({ rel, onClose }: { rel: ErdRelationship; onClose: () => void }) {
  const type = rel.inferred ? 'inferred (naming heuristic)' : rel.label?.toUpperCase().includes('JOIN') ? 'join' : 'explicit FK'
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <GitBranch className="h-3.5 w-3.5 text-primary" />
        <span className="text-sm font-semibold">Relationship</span>
        <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground" title="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3 text-[11px]">
        <div className="flex items-center gap-2 font-mono">
          <div className="rounded bg-secondary/60 px-2 py-1">
            <div className="text-[9px] text-muted-foreground">{rel.fromTable}</div>
            <div className="text-foreground/90">{rel.fromColumn}</div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
          <div className="rounded bg-secondary/60 px-2 py-1">
            <div className="text-[9px] text-muted-foreground">{rel.toTable}</div>
            <div className="text-foreground/90">{rel.toColumn}</div>
          </div>
        </div>
        <dl className="mt-3 space-y-1.5">
          <Row label="Type" value={type} />
          <Row label="Label" value={rel.label || '—'} />
          <Row label="Cardinality" value={`many ${rel.fromTable} → one ${rel.toTable}`} />
        </dl>
        {rel.inferred && (
          <p className="mt-3 rounded bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-300">
            This link was guessed from the column name (<code className="font-mono">{rel.fromColumn}</code> →{' '}
            <code className="font-mono">{rel.toTable}</code>). It is not declared as a FOREIGN KEY in your DDL.
          </p>
        )}
      </div>
    </>
  )
}

function RelRow({ rel, dir }: { rel: ErdRelationship; dir: 'in' | 'out' }) {
  const otherTable = dir === 'out' ? rel.toTable : rel.fromTable
  const otherCol = dir === 'out' ? rel.toColumn : rel.fromColumn
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <ArrowRight className={cn('h-3 w-3 shrink-0', dir === 'out' ? 'text-emerald-400' : 'text-sky-400')} />
      <span className="truncate font-mono text-[11px] text-foreground/90">
        {rel.fromTable}.{rel.fromColumn}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">→ {otherTable}.{otherCol}</span>
      {rel.inferred && <span className="shrink-0 text-[9px] text-amber-400">?</span>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border/40 px-3 py-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-foreground/90">{value}</dd>
    </div>
  )
}
