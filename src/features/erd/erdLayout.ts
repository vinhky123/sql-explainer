import dagre from 'dagre'
import type { Node, Edge } from '@xyflow/react'

export const NODE_WIDTH = 260
export const HEADER_HEIGHT = 40
export const ROW_HEIGHT = 26
export const NODE_PADDING = 10

export function nodeHeight(columnCount: number): number {
  return HEADER_HEIGHT + Math.max(columnCount, 1) * ROW_HEIGHT + NODE_PADDING
}

export function layoutErd(
  nodes: Node[],
  edges: Edge[],
  direction: 'LR' | 'TB' = 'LR',
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: direction, nodesep: 50, ranksep: 100, marginx: 30, marginy: 30 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of nodes) {
    const colCount = (n.data as any)?.columnCount ?? 1
    g.setNode(n.id, { width: NODE_WIDTH, height: nodeHeight(colCount) })
  }
  for (const e of edges) g.setEdge(e.source, e.target)

  dagre.layout(g)

  const laid = nodes.map((n) => {
    const colCount = (n.data as any)?.columnCount ?? 1
    const pos = g.node(n.id)
    const h = nodeHeight(colCount)
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - h / 2 } }
  })

  return { nodes: laid, edges }
}
