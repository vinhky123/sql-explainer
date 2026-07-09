import { useMemo, useState, useCallback, type MouseEvent } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  type Node,
  type Edge,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useSqlStore } from '@/store/sqlStore'
import { parseSql } from '@/lib/sql/parser'
import { extractErd, type ErdModel, type ErdTable, type ErdRelationship } from '@/lib/sql/erdExtractor'
import { layoutErd } from './erdLayout'
import { TableNode, type TableNodeData } from './TableNode'
import { exportPng, exportSvg, exportDbmlFile } from './erdExport'
import { explainSchema } from './erdExplain'
import { ErdDetailsPanel } from './ErdDetailsPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Network, AlertCircle, FileCode2, ImageIcon, FileImage, Database,
  GitBranch, Maximize, KeyRound, Link2, ChevronDown, ChevronRight,
} from 'lucide-react'

const nodeTypes = { table: TableNode }

interface HoverRef {
  table: string
  column: string
}

function edgeMatches(hover: HoverRef | null, e: { fromTable: string; fromColumn: string; toTable: string; toColumn: string }): boolean {
  if (!hover) return false
  return (
    (e.fromTable === hover.table && e.fromColumn === hover.column) ||
    (e.toTable === hover.table && e.toColumn === hover.column)
  )
}

function Canvas({ model, sampleChip }: { model: ErdModel; sampleChip?: { onDismiss: () => void } | null }) {
  const [hover, setHover] = useState<HoverRef | null>(null)
  const [direction, setDirection] = useState<'LR' | 'TB'>('LR')
  const [aboutOpen, setAboutOpen] = useState(true)
  const [selectedTable, setSelectedTable] = useState<ErdTable | null>(null)
  const [selectedRel, setSelectedRel] = useState<ErdRelationship | null>(null)
  const { fitView } = useReactFlow()
  const explanation = useMemo(() => explainSchema(model), [model])

  const onColumnHover = useCallback((table: string, column: string | null) => {
    setHover(column ? { table, column } : null)
  }, [])

  const onNodeClick = useCallback((_e: MouseEvent, node: Node) => {
    setSelectedTable((node.data as TableNodeData).table)
    setSelectedRel(null)
  }, [])

  const onEdgeClick = useCallback((_e: MouseEvent, edge: Edge) => {
    setSelectedRel(model.relationships.find((r) => r.id === edge.id) ?? null)
    setSelectedTable(null)
  }, [model.relationships])

  const onPaneClick = useCallback(() => {
    setSelectedTable(null)
    setSelectedRel(null)
  }, [])

  const { nodes, edges } = useMemo(() => {
    const rawNodes: Node<TableNodeData>[] = model.tables.map((t) => ({
      id: t.name,
      type: 'table',
      position: { x: 0, y: 0 },
      data: {
        table: t,
        columnCount: t.columns.length,
        source: t.source,
        onColumnHover,
        highlightColumn: hover?.table === t.name ? hover.column : null,
      },
    }))

    const rawEdges: Edge[] = model.relationships.map((r) => {
      const active = edgeMatches(hover, r)
      return {
        id: r.id,
        source: r.fromTable,
        sourceHandle: r.fromColumn,
        target: r.toTable,
        targetHandle: r.toColumn,
        type: 'smoothstep',
        animated: active,
        label: r.inferred ? '?' : r.label,
        labelStyle: { fontSize: 9, fill: r.inferred ? '#f59e0b' : '#10b981', fontWeight: 600 },
        labelBgStyle: { fill: '#18181b' },
        style: {
          stroke: r.inferred ? '#f59e0b' : active ? '#a855f7' : '#52525b',
          strokeWidth: active ? 2.5 : 1.5,
          strokeDasharray: r.inferred ? '5 4' : undefined,
        },
      }
    })

    const laid = layoutErd(rawNodes, rawEdges, direction)
    return laid
  }, [model, hover, direction, onColumnHover])

  const inferredCount = model.relationships.filter((r) => r.inferred).length
  const explicitCount = model.relationships.length - inferredCount
  const indexCount = model.indexes.length
  const pkCount = model.tables.reduce((acc, t) => acc + t.columns.filter((c) => c.primaryKey).length, 0)

  return (
    <div className="flex h-full flex-col">
      {sampleChip && (
        <div className="flex items-center gap-2 border-b border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] text-sky-300">
          <Database className="h-3 w-3" />
          <span>Sample schema — paste your own DDL in the editor to replace it.</span>
          <button onClick={sampleChip.onDismiss} className="ml-auto text-sky-300/70 hover:text-sky-200" title="Dismiss">
            ×
          </button>
        </div>
      )}

      {aboutOpen ? (
        <div className="border-b border-border/60 bg-secondary/30 px-3 py-2 text-[11px]">
          <button
            onClick={() => setAboutOpen(false)}
            className="flex items-center gap-1 font-medium text-foreground hover:text-primary"
          >
            <ChevronDown className="h-3 w-3" /> About this schema
          </button>

          <p className="mt-1 text-foreground/90">{explanation.summary}</p>

          {explanation.relationships.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {explanation.relationships.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-muted-foreground">
                  <span
                    className={cn(
                      'mt-1 inline-block h-1 w-1 shrink-0 rounded-full',
                      r.inferred ? 'bg-amber-400' : 'bg-emerald-400',
                    )}
                  />
                  <span>
                    {r.text}{' '}
                    {r.inferred && (
                      <span className="text-amber-400/80">(inferred from column name)</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {explanation.standaloneTables.length > 0 && (
            <p className="mt-1.5 text-muted-foreground">
              {explanation.standaloneTables.join(', ')}{' '}
              {explanation.standaloneTables.length > 1 ? 'have' : 'has'} no foreign-key links.
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-1.5 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <KeyRound className="h-3 w-3 text-amber-400" /> primary key
            </span>
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-3 w-3 text-cyan-400" /> unique
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded-full bg-emerald-500/70" /> explicit FK
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded-full border-t border-dashed border-amber-400" /> inferred
            </span>
            <span className="ml-auto text-muted-foreground/70">hover a column to trace its links</span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAboutOpen(true)}
          className="border-b border-border/60 bg-secondary/30 px-3 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="mr-1 inline h-3 w-3" />
          About this schema — {explanation.summary}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <Network className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">Schema diagram</span>
        <span className="text-xs text-muted-foreground">
          {model.tables.length} table{model.tables.length !== 1 ? 's' : ''} ·{' '}
          {model.relationships.length === 0
            ? '0 relationships'
            : `${model.relationships.length} rel${model.relationships.length !== 1 ? 's' : ''} (${explicitCount} explicit${inferredCount > 0 ? ` + ${inferredCount} inferred` : ''})`}
          {indexCount > 0 && ` · ${indexCount} index${indexCount !== 1 ? 'es' : ''}`}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <KeyRound className="h-3 w-3 text-amber-400" /> {pkCount} PK{pkCount !== 1 ? 's' : ''}
        </span>

        <div className="flex-1" />

        <Button
          size="sm"
          variant={direction === 'LR' ? 'secondary' : 'ghost'}
          onClick={() => setDirection((d) => (d === 'LR' ? 'TB' : 'LR'))}
          title="Toggle layout direction"
        >
          <GitBranch className="h-3.5 w-3.5" />
          {direction === 'LR' ? 'Horizontal' : 'Vertical'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => fitView({ padding: 0.3, duration: 300 })} title="Fit to view">
          <Maximize className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={() => exportDbmlFile(model)} title="Export DBML">
          <FileCode2 className="h-3.5 w-3.5" />
          DBML
        </Button>
        <Button size="sm" variant="ghost" onClick={() => exportSvg()} title="Export SVG">
          <FileImage className="h-3.5 w-3.5" />
          SVG
        </Button>
        <Button size="sm" variant="ghost" onClick={() => exportPng()} title="Export PNG">
          <ImageIcon className="h-3.5 w-3.5" />
          PNG
        </Button>
      </div>

      {model.warnings.length > 0 && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-300">
          {model.warnings.slice(0, 2).join(' · ')}
          {model.warnings.length > 2 && ` (+${model.warnings.length - 2} more)`}
        </div>
      )}

      <div className="relative flex-1 min-h-0 bg-background/40">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          fitView
          fitViewOptions={{ padding: 0.25, minZoom: 0.3 }}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          panOnDrag
          zoomOnScroll
          minZoom={0.1}
          maxZoom={2.5}
        >
          <Background color="hsl(240 4% 16%)" gap={24} size={1} />
          <Controls showInteractive={false} className="!bg-card !border-border [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" />
        </ReactFlow>
        <ErdDetailsPanel
          table={selectedTable}
          relationship={selectedRel}
          model={model}
          onClose={() => {
            setSelectedTable(null)
            setSelectedRel(null)
          }}
        />
      </div>

      <div className="flex items-center gap-4 border-t border-border/60 px-3 py-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className={cn('inline-block h-2 w-4 rounded-full', 'bg-emerald-500/70')} /> explicit FK / join
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded-full border border-dashed border-amber-400" /> inferred (naming heuristic)
        </span>
        <span className="ml-auto">drag to pan · scroll to zoom · hover a column to trace its edges</span>
      </div>
    </div>
  )
}

interface ErdCanvasProps {
  onLoadSample?: () => void
  sampleChip?: { onDismiss: () => void } | null
}

export function ErdCanvas({ onLoadSample, sampleChip }: ErdCanvasProps = {}) {
  const { sql, dialect } = useSqlStore()
  const parse = useMemo(() => parseSql(sql, dialect), [sql, dialect])
  const model = useMemo(() => extractErd(parse), [parse])

  if (!sql.trim()) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Network className="h-10 w-10 text-muted-foreground" />
        <div className="max-w-sm space-y-2">
          <p className="text-sm font-medium text-foreground">Visualize your database schema as a diagram</p>
          <p className="text-xs text-muted-foreground">
            An ERD turns <code className="rounded bg-secondary px-1 font-mono">CREATE TABLE</code> statements into
            boxes-and-lines: tables, columns with types, and the foreign keys that link them. Or paste a{' '}
            <code className="rounded bg-secondary px-1 font-mono">SELECT</code> to see which tables/columns it touches.
          </p>
        </div>
        {onLoadSample && (
          <Button size="sm" onClick={onLoadSample}>
            <FileCode2 className="h-3.5 w-3.5" /> Load sample schema
          </Button>
        )}
        <p className="text-[11px] text-muted-foreground">…or start typing your DDL in the editor.</p>
      </div>
    )
  }

  if (!parse.ok) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircle className="h-8 w-8 text-amber-400" />
        <p className="text-sm text-muted-foreground">Fix the syntax error to build the diagram.</p>
      </div>
    )
  }

  if (model.tables.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Database className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No tables found. ERD supports CREATE TABLE, ALTER TABLE, CREATE INDEX, and SELECT statements.</p>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <Canvas model={model} sampleChip={sampleChip} />
    </ReactFlowProvider>
  )
}
