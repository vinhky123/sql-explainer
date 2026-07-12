import { useMemo, useState, useEffect, useCallback } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useSqlStore } from '@/store/sqlStore'
import { useEditorStore } from '@/store/editorStore'
import { parseSql } from '@/lib/sql/parser'
import { splitClauses } from '@/lib/sql/clauseSplitter'
import { buildExecutionFlow, type FlowStep } from '@/lib/sql/executionOrder'
import { buildSnapshots } from '@/lib/sql/dataTransform'
import { FlowNode, type FlowNodeData } from './FlowNode'
import { DataPreview } from './DataPreview'
import { Play, Pause, SkipBack, SkipForward, Workflow, AlertCircle, Table2, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const nodeTypes = { flow: FlowNode }

function FlowCanvas({ steps, activeIdx }: { steps: FlowStep[]; activeIdx: number }) {
  const highlight = useEditorStore((s) => s.highlight)
  const clearHighlight = useEditorStore((s) => s.clearHighlight)
  const [hovering, setHovering] = useState(false)

  const onHover = useCallback(
    (offset: number, endOffset: number) => {
      if (offset === 0) {
        clearHighlight()
        setHovering(false)
      } else {
        highlight(offset, endOffset)
        setHovering(true)
      }
    },
    [highlight, clearHighlight],
  )
  const onSelect = useCallback(
    (offset: number, endOffset: number) => highlight(offset, endOffset),
    [highlight],
  )

  const { nodes, edges } = useMemo(() => {
    const nodes: Node<FlowNodeData>[] = steps.map((step, i) => ({
      id: step.id,
      type: 'flow',
      position: { x: 0, y: i * 220 },
      data: { step, active: i === activeIdx, onHover, onSelect },
    }))
    const edges: Edge[] = steps.slice(0, -1).map((s, i) => ({
      id: `${s.id}->${steps[i + 1].id}`,
      source: s.id,
      target: steps[i + 1].id,
      type: 'smoothstep',
      animated: i === activeIdx || i + 1 === activeIdx,
      style: { stroke: i === activeIdx || i + 1 === activeIdx ? 'hsl(263 70% 60%)' : 'hsl(240 4% 16%)', strokeWidth: 2 },
    }))
    return { nodes, edges }
  }, [steps, activeIdx, onHover, onSelect])

  return (
    <div className="h-full bg-background/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3, minZoom: 0.4 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag={!hovering}
        zoomOnScroll
      >
        <Background color="hsl(240 4% 16%)" gap={24} size={1} />
        <Controls showInteractive={false} className="!bg-card !border-border [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" />
      </ReactFlow>
    </div>
  )
}

type View = 'pipeline' | 'data'

function ControlsShell({
  steps,
  view,
  setView,
  dataAvailable,
  activeIdx,
  setActiveIdx,
  playing,
  setPlaying,
}: {
  steps: FlowStep[]
  view: View
  setView: (v: View) => void
  dataAvailable: boolean
  activeIdx: number
  setActiveIdx: (fn: (i: number) => number) => void
  playing: boolean
  setPlaying: (fn: (p: boolean) => boolean) => void
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
      <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="View mode">
        <button
          role="tab"
          aria-selected={view === 'pipeline'}
          onClick={() => setView('pipeline')}
          className={cn(
            'flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
            view === 'pipeline' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <GitBranch className="h-3 w-3" />
          Pipeline
        </button>
        <button
          role="tab"
          aria-selected={view === 'data'}
          onClick={() => dataAvailable && setView('data')}
          disabled={!dataAvailable}
          className={cn(
            'flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
            view === 'data' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
            !dataAvailable && 'cursor-not-allowed opacity-40',
          )}
          title={dataAvailable ? 'Animated data preview' : 'Data preview unavailable for this query'}
        >
          <Table2 className="h-3 w-3" />
          Data
        </button>
      </div>
      <span className="text-xs text-muted-foreground">{steps.length} steps</span>
      <div className="flex-1" />
      <Button size="sm" variant="ghost" onClick={() => { setActiveIdx(() => -1); setPlaying(() => false) }} title="Reset">
        <SkipBack className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant={playing ? 'secondary' : 'default'}
        onClick={() => {
          if (activeIdx >= steps.length - 1) setActiveIdx(() => -1)
          setPlaying((p) => !p)
        }}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {playing ? 'Pause' : 'Play'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setActiveIdx((i) => Math.min(i + 1, steps.length - 1))} title="Next step">
        <SkipForward className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

export function ExecutionFlow() {
  const { sql, dialect } = useSqlStore()
  const parse = useMemo(() => parseSql(sql, dialect), [sql, dialect])
  const segments = useMemo(() => splitClauses(sql), [sql])
  const steps = useMemo(() => buildExecutionFlow(segments, parse, sql), [segments, parse, sql])
  const snapshotResult = useMemo(() => buildSnapshots(steps, parse, sql), [steps, parse, sql])

  const [view, setView] = useState<View>(snapshotResult ? 'data' : 'pipeline')
  const [activeIdx, setActiveIdx] = useState(-1)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setActiveIdx(-1)
    setPlaying(false)
  }, [steps])

  useEffect(() => {
    if (!playing) return
    if (activeIdx >= steps.length - 1) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setActiveIdx((i) => i + 1), 1400)
    return () => clearTimeout(t)
  }, [playing, activeIdx, steps.length])

  if (!sql.trim()) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Workflow className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Paste a SQL query to see its execution order.</p>
      </div>
    )
  }

  if (!parse.ok) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircle className="h-8 w-8 text-amber-400" />
        <p className="text-sm text-muted-foreground">Fix the syntax error to visualize execution order.</p>
      </div>
    )
  }

  if (steps.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Workflow className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">This doesn't look like a SELECT query.</p>
      </div>
    )
  }

  const dataAvailable = !!snapshotResult
  const activeStep = activeIdx >= 0 ? steps[activeIdx] : null

  return (
    <div className="flex h-full flex-col">
      <ControlsShell
        steps={steps}
        view={view}
        setView={setView}
        dataAvailable={dataAvailable}
        activeIdx={activeIdx}
        setActiveIdx={setActiveIdx}
        playing={playing}
        setPlaying={setPlaying}
      />

      {activeStep && view === 'pipeline' && (
        <div className="border-b border-primary/30 bg-primary/5 px-3 py-1.5 text-xs" aria-live="polite">
          <span className="font-mono text-primary">Step {activeIdx + 1}/{steps.length}:</span>{' '}
          <span className="text-foreground">{activeStep.clause}</span>
          <span className="text-muted-foreground"> — {activeStep.description}</span>
        </div>
      )}

      <div className="flex-1 min-h-0">
        {view === 'pipeline' ? (
          <ReactFlowProvider>
            <FlowCanvas steps={steps} activeIdx={activeIdx} />
          </ReactFlowProvider>
        ) : (
          <DataPreview
            steps={steps}
            snapshots={snapshotResult!.snapshots}
            activeIdx={activeIdx}
            onStepClick={(i) => { setActiveIdx(() => i); setPlaying(() => false) }}
          />
        )}
      </div>
    </div>
  )
}
