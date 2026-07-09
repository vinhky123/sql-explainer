import type { ClauseSegment } from './clauseSplitter'
import type { ParseResult } from './parser'

export type RowDirection = 'resolve' | 'narrows' | 'group' | 'filter-groups' | 'project' | 'distinct' | 'reorders' | 'limits'

export interface FlowStep {
  id: string
  order: number
  clause: string
  snippet: string
  startOffset: number
  endOffset: number
  description: string
  rowDirection: RowDirection
  tables?: string[]
  joinTypes?: string[]
  columns?: string[]
  aggregates?: string[]
  setOp?: string
}

const ORDER: Record<string, number> = {
  FROM: 1,
  WHERE: 2,
  'GROUP BY': 3,
  HAVING: 4,
  SELECT: 5,
  DISTINCT: 6,
  'ORDER BY': 7,
  LIMIT: 8,
  OFFSET: 8,
  WINDOW: 5,
}

function colName(node: any): string {
  if (!node) return ''
  if (node.type === 'column_ref') {
    const col = node.column?.expr?.value ?? node.column ?? ''
    const tbl = node.table ? `${node.table}.` : ''
    return `${tbl}${col}`
  }
  if (node.type === 'aggr_func') {
    const inner = colName(node.args?.expr)
    return `${node.name}(${inner})`
  }
  if (node.type === 'window_func') return `${node.name}(...)`
  if (node.type === 'expr') return colName(node.expr)
  if (node.type === 'star') return '*'
  if (node.type === 'binary_expr') return `${colName(node.left)} ${node.operator} ${colName(node.right)}`
  if (node.value !== undefined) return String(node.value)
  return ''
}

function collectAggregates(node: any, acc: string[] = []): string[] {
  if (!node || typeof node !== 'object') return acc
  if (Array.isArray(node)) {
    node.forEach((n) => collectAggregates(n, acc))
    return acc
  }
  if (node.type === 'aggr_func') {
    acc.push(`${node.name}(${colName(node.args?.expr)})`)
  }
  for (const k of Object.keys(node)) {
    if (k === 'type') continue
    collectAggregates(node[k], acc)
  }
  return acc
}

function fromTableName(t: any): string {
  if (t.table) return t.as ? `${t.table} AS ${t.as}` : String(t.table)
  const alias = t.as ? ` AS ${t.as}` : ''
  if (t.expr?.ast) return `(subquery)${alias}`
  return `(derived)${alias}`
}

export function buildExecutionFlow(
  segments: ClauseSegment[],
  parse: ParseResult,
): FlowStep[] {
  if (!parse.ok || !parse.ast) {
    return []
  }

  const ast = Array.isArray(parse.ast) ? parse.ast[0] : parse.ast
  if (!ast) return []
  const steps: FlowStep[] = []

  const byKeyword = new Map<string, ClauseSegment>()
  for (const s of segments) {
    if (!byKeyword.has(s.keyword)) byKeyword.set(s.keyword, s)
  }

  const tables: string[] = []
  const joinTypes: string[] = []
  if (Array.isArray(ast.from)) {
    ast.from.forEach((t: any, idx: number) => {
      const name = fromTableName(t)
      if (idx === 0) tables.push(name)
      else {
        tables.push(`${t.join ?? 'JOIN'} ${name}`)
        if (t.join) joinTypes.push(t.join)
      }
    })
  }

  const selectColumns: string[] = []
  const selectAggregates: string[] = []
  if (Array.isArray(ast.columns)) {
    ast.columns.forEach((c: any) => {
      if (c.type === 'star') selectColumns.push('*')
      else {
        const name = c.as ? `${colName(c.expr)} AS ${c.as}` : colName(c.expr)
        selectColumns.push(name)
        collectAggregates(c.expr, selectAggregates)
      }
    })
  }

  const hasDistinct = ast.distinct && ast.distinct.type
  const groupCols: string[] = Array.isArray(ast.groupby?.columns)
    ? ast.groupby.columns.map((c: any) => colName(c))
    : []
  const orderCols: string[] = Array.isArray(ast.orderby)
    ? ast.orderby.map((o: any) => `${colName(o.expr)} ${o.type ?? ''}`.trim())
    : []

  const addStep = (
    keyword: string,
    clause: string,
    description: string,
    rowDirection: RowDirection,
    extra: Partial<FlowStep> = {},
  ) => {
    const seg = byKeyword.get(keyword)
    if (!seg) return
    steps.push({
      id: keyword,
      order: ORDER[keyword] ?? 99,
      clause,
      snippet: seg.text,
      startOffset: seg.startOffset,
      endOffset: seg.endOffset,
      description,
      rowDirection,
      ...extra,
    })
  }

  if (byKeyword.has('FROM')) {
    addStep('FROM', 'FROM', `Load ${tables.length} table${tables.length > 1 ? 's' : ''}: ${tables.join(', ')}`, 'resolve', { tables, joinTypes })
  }
  if (byKeyword.has('WHERE')) {
    addStep('WHERE', 'WHERE', 'Filter rows that match the condition', 'narrows')
  }
  if (byKeyword.has('GROUP BY')) {
    addStep('GROUP BY', 'GROUP BY', `Aggregate rows by ${groupCols.join(', ') || 'columns'}`, 'group', { columns: groupCols })
  }
  if (byKeyword.has('HAVING')) {
    addStep('HAVING', 'HAVING', 'Filter aggregated groups', 'filter-groups')
  }
  if (byKeyword.has('SELECT')) {
    addStep('SELECT', hasDistinct ? 'SELECT DISTINCT' : 'SELECT', hasDistinct ? 'Project unique rows (deduplicated)' : 'Project selected columns', 'project', { columns: selectColumns, aggregates: selectAggregates })
  }
  if (hasDistinct && !byKeyword.has('SELECT')) {
    steps.push({ id: 'DISTINCT', order: 6, clause: 'DISTINCT', snippet: 'DISTINCT', startOffset: 0, endOffset: 0, description: 'Remove duplicate rows', rowDirection: 'distinct' })
  }
  if (byKeyword.has('ORDER BY')) {
    addStep('ORDER BY', 'ORDER BY', `Sort by ${orderCols.join(', ') || 'columns'}`, 'reorders', { columns: orderCols })
  }
  if (byKeyword.has('LIMIT')) {
    addStep('LIMIT', 'LIMIT', 'Restrict the number of returned rows', 'limits')
  }
  if (byKeyword.has('OFFSET')) {
    addStep('OFFSET', 'OFFSET', 'Skip the first N rows', 'limits')
  }

  steps.sort((a, b) => a.order - b.order)
  steps.forEach((s, i) => (s.order = i + 1))

  return steps
}
