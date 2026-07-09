import { useMemo, useState, useCallback } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls,
  type Node, type Edge, useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import { usePlanStore } from '@/store/planStore'
import { parsePlan, buildNarrative, type PlanNodeData } from '@/lib/queryPlan/parsePlan'
import { PlanNodeView, type PlanNodeViewData } from './PlanNodeView'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  FileCode2, AlertCircle, AlertTriangle, Info, Gauge, ListChecks, ScrollText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const nodeTypes = { plan: PlanNodeView }
const NODE_WIDTH = 280
const NODE_HEIGHT = 175

function layoutTree(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60, marginx: 30, marginy: 30 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)
  const laid = nodes.map((n) => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } }
  })
  return { nodes: laid, edges }
}

function flatten(node: PlanNodeData, acc: PlanNodeData[] = []): PlanNodeData[] {
  acc.push(node)
  node.children.forEach((c) => flatten(c, acc))
  return acc
}

function TreeCanvas({ root, flaggedIds, selectedId, onSelect }: {
  root: PlanNodeData
  flaggedIds: Set<string>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { fitView } = useReactFlow()
  const handleSelect = useCallback((id: string) => onSelect(id), [onSelect])

  const { nodes, edges } = useMemo(() => {
    const all = flatten(root)
    const rawNodes: Node<PlanNodeViewData>[] = all.map((n) => ({
      id: n.id,
      type: 'plan',
      position: { x: 0, y: 0 },
      data: {
        node: n,
        flagged: flaggedIds.has(n.id),
        onSelect: handleSelect,
      },
    }))
    const rawEdges: Edge[] = []
    for (const n of all) {
      for (const child of n.children) {
        rawEdges.push({
          id: `${n.id}->${child.id}`,
          source: n.id,
          target: child.id,
          type: 'smoothstep',
          animated: selectedId === child.id || selectedId === n.id,
          style: {
            stroke: selectedId === child.id || selectedId === n.id ? '#a855f7' : '#3f3f46',
            strokeWidth: selectedId === child.id || selectedId === n.id ? 2.5 : 1.5,
          },
        })
      }
    }
    return layoutTree(rawNodes, rawEdges)
  }, [root, flaggedIds, selectedId, handleSelect])

  return (
    <div className="relative h-full min-h-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.1}
        maxZoom={2.5}
      >
        <Background color="hsl(240 4% 16%)" gap={24} size={1} />
        <Controls showInteractive={false} className="!bg-card !border-border [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" />
      </ReactFlow>
      <button
        onClick={() => fitView({ padding: 0.25, duration: 300 })}
        className="absolute right-3 top-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/90 px-2.5 text-xs backdrop-blur hover:bg-secondary"
      >
        Fit
      </button>
    </div>
  )
}

const sevMeta = {
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  info: { icon: Info, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
}

function FindingsPanel({ plan, onSelect }: { plan: ReturnType<typeof parsePlan>; onSelect: (id: string) => void }) {
  const order = ['critical', 'warning', 'info'] as const
  const sorted = [...plan.findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))

  if (sorted.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <ListChecks className="h-7 w-7 text-emerald-400" />
        <p className="text-sm text-muted-foreground">No issues detected. The plan looks reasonable.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-3">
      <div className="space-y-2">
        {sorted.map((f) => {
          const m = sevMeta[f.severity]
          const Icon = m.icon
          return (
            <button
              key={f.id}
              onClick={() => f.nodeId && onSelect(f.nodeId)}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:bg-secondary/60',
                m.bg, m.border,
              )}
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', m.color)} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">{f.severity}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{f.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{f.detail}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NarrativePanel({ plan }: { plan: ReturnType<typeof parsePlan> }) {
  const lines = useMemo(() => buildNarrative(plan), [plan])
  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-xl space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ScrollText className="h-4 w-4 text-primary" />
          Plain-English summary
        </div>
        {lines.map((l, i) => (
          <p key={i} className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-sm leading-relaxed text-foreground/90">
            {l}
          </p>
        ))}
        <div className="flex flex-wrap gap-3 pt-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-emerald-500" /> &lt;10% time</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-amber-500" /> 10–30%</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-red-500" /> &gt;30% (hot)</span>
        </div>
      </div>
    </div>
  )
}

export function PlanTree() {
  const planText = usePlanStore((s) => s.planText)
  const plan = useMemo(() => parsePlan(planText), [planText])
  const [tab, setTab] = useState('tree')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const flaggedIds = useMemo(() => new Set(plan.findings.map((f) => f.nodeId).filter(Boolean) as string[]), [plan])

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const handleFindingSelect = useCallback((id: string) => {
    setSelectedId(id)
    setTab('tree')
  }, [])

  if (!planText.trim()) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <FileCode2 className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Paste EXPLAIN output to visualize the plan tree.</p>
      </div>
    )
  }

  if (!plan.ok) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircle className="h-8 w-8 text-amber-400" />
        <p className="text-sm text-muted-foreground">Couldn't parse the plan.</p>
        {plan.error && <p className="max-w-md font-mono text-[11px] text-amber-300">{plan.error}</p>}
        <p className="text-xs text-muted-foreground">Supports PostgreSQL <code className="font-mono">EXPLAIN (ANALYZE, FORMAT JSON)</code> and indented text plans.</p>
      </div>
    )
  }

  if (!plan.root) return null

  const findingsCount = plan.findings.length
  const criticalCount = plan.findings.filter((f) => f.severity === 'critical').length

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <Gauge className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">Plan tree</span>
        <span className="text-xs text-muted-foreground">
          {plan.nodeCount} nodes · {plan.format.toUpperCase()}
          {plan.executionTime != null && ` · ${plan.executionTime.toFixed(2)} ms`}
        </span>
        {criticalCount > 0 && (
          <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
            {criticalCount} critical
          </span>
        )}
        <div className="flex-1" />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border/60 px-3 py-1.5">
          <TabsList>
            <TabsTrigger value="tree">Tree</TabsTrigger>
            <TabsTrigger value="findings">
              Findings{findingsCount > 0 ? ` (${findingsCount})` : ''}
            </TabsTrigger>
            <TabsTrigger value="narrative">Narrative</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="tree" className="mt-0 min-h-0 flex-1">
          <ReactFlowProvider>
            <TreeCanvas root={plan.root} flaggedIds={flaggedIds} selectedId={selectedId} onSelect={handleSelect} />
          </ReactFlowProvider>
        </TabsContent>
        <TabsContent value="findings" className="mt-0 min-h-0 flex-1">
          <FindingsPanel plan={plan} onSelect={handleFindingSelect} />
        </TabsContent>
        <TabsContent value="narrative" className="mt-0 min-h-0 flex-1">
          <NarrativePanel plan={plan} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
