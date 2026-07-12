import { splitClauses, type ClauseSegment } from './clauseSplitter'
import type { ParseResult } from './parser'
import type { Dialect } from '@/types'
import { isAggregateName, funcNameOf } from './functions'

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
  cte?: string
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

function collectAggregates(node: any, acc: string[] = [], dialect: Dialect = 'postgresql'): string[] {
  if (!node || typeof node !== 'object') return acc
  if (Array.isArray(node)) {
    node.forEach((n) => collectAggregates(n, acc, dialect))
    return acc
  }
  if (node.type === 'aggr_func') {
    acc.push(`${node.name}(${colName(node.args?.expr)})`)
  } else if (node.type === 'function' && isAggregateName(funcNameOf(node), dialect)) {
    const name = funcNameOf(node)
    const argNode = Array.isArray(node.args?.value) ? node.args.value[0] : node.args?.expr
    acc.push(`${name.toUpperCase()}(${colName(argNode)})`)
  }
  for (const k of Object.keys(node)) {
    if (k === 'type') continue
    collectAggregates(node[k], acc, dialect)
  }
  return acc
}

function fromTableName(t: any): string {
  if (t.table) return t.as ? `${t.table} AS ${t.as}` : String(t.table)
  const alias = t.as ? ` AS ${t.as}` : ''
  if (t.expr?.ast) return `(subquery)${alias}`
  return `(derived)${alias}`
}

export function buildSelectFlow(
  segments: ClauseSegment[],
  ast: any,
  dialect: Dialect,
  cte: string | undefined,
): FlowStep[] {
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
        collectAggregates(c.expr, selectAggregates, dialect)
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
      id: cte ? `${cte}::${keyword}` : keyword,
      order: ORDER[keyword] ?? 99,
      clause,
      snippet: seg.text,
      startOffset: seg.startOffset,
      endOffset: seg.endOffset,
      description,
      rowDirection,
      cte,
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
    steps.push({ id: cte ? `${cte}::DISTINCT` : 'DISTINCT', order: 6, clause: 'DISTINCT', snippet: 'DISTINCT', startOffset: 0, endOffset: 0, description: 'Remove duplicate rows', rowDirection: 'distinct', cte })
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

export interface CteBody {
  name: string
  bodyStart: number
  bodyEnd: number
  ast: any
}

function skipWhitespaceAndCommas(text: string, i: number): number {
  while (i < text.length && /[\s,]/.test(text[i])) i++
  return i
}

function readIdentifier(text: string, i: number): { name: string; next: number } | null {
  if (text[i] === '"') {
    const end = text.indexOf('"', i + 1)
    if (end < 0) return null
    return { name: text.slice(i + 1, end), next: end + 1 }
  }
  const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i))
  if (!m) return null
  return { name: m[0], next: i + m[0].length }
}

function findMatchingParen(text: string, open: number): number {
  let depth = 0
  let inSingle = false
  let inDouble = false
  let inLine = false
  let inBlock = false
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    const nx = text[i + 1] ?? ''
    if (inLine) { if (ch === '\n') inLine = false; continue }
    if (inBlock) { if (ch === '*' && nx === '/') { inBlock = false; i++ } continue }
    if (inSingle) { if (ch === "'") inSingle = false; continue }
    if (inDouble) { if (ch === '"') inDouble = false; continue }
    if (ch === '-' && nx === '-') { inLine = true; i++; continue }
    if (ch === '/' && nx === '*') { inBlock = true; i++; continue }
    if (ch === "'") { inSingle = true; continue }
    if (ch === '"') { inDouble = true; continue }
    if (ch === '(') { depth++; continue }
    if (ch === ')') { depth--; if (depth === 0) return i; continue }
  }
  return -1
}

export function extractCteBodies(
  withSegment: ClauseSegment | undefined,
  ast: any,
): CteBody[] {
  if (!withSegment || !Array.isArray(ast?.with)) return []
  const origin = withSegment.startOffset
  const text = withSegment.text
  const out: CteBody[] = []
  let i = 0
  const withMatch = /^WITH\s+/i.exec(text)
  if (!withMatch) return []
  i = withMatch[0].length
  const rec = /^RECURSIVE\s+/i.exec(text.slice(i))
  if (rec) i += rec[0].length

  for (let c = 0; c < ast.with.length; c++) {
    const cte = ast.with[c]
    i = skipWhitespaceAndCommas(text, i)
    const id = readIdentifier(text, i)
    if (!id) break
    i = id.next
    i = skipWhitespaceAndCommas(text, i)
    if (text[i] === '(') {
      const close = findMatchingParen(text, i)
      if (close < 0) break
      i = close + 1
      i = skipWhitespaceAndCommas(text, i)
    }
    const asMatch = /^AS\b/i.exec(text.slice(i))
    if (!asMatch) break
    i += asMatch[0].length
    i = skipWhitespaceAndCommas(text, i)
    if (text[i] !== '(') break
    const open = i
    const close = findMatchingParen(text, open)
    if (close < 0) break
    const innerAst = cte.stmt?.ast ?? cte.stmt
    out.push({
      name: id.name,
      bodyStart: origin + open + 1,
      bodyEnd: origin + close,
      ast: innerAst,
    })
    i = close + 1
  }
  return out
}

export function buildExecutionFlow(
  segments: ClauseSegment[],
  parse: ParseResult,
  sql: string,
): FlowStep[] {
  if (!parse.ok || !parse.ast) return []
  const ast = Array.isArray(parse.ast) ? parse.ast[0] : parse.ast
  if (!ast) return []
  const dialect: Dialect = parse.dialect ?? 'postgresql'

  const withSeg = segments.find((s) => s.keyword === 'WITH')
  const cteBodies = extractCteBodies(withSeg, ast)

  const steps: FlowStep[] = []

  for (const body of cteBodies) {
    const inner = body.ast
    if (!inner || inner.type !== 'select' || inner._next || !inner.from?.[0]?.table) continue
    const bodyText = sql.slice(body.bodyStart, body.bodyEnd)
    const bodySegs = splitClauses(bodyText).map((s) => ({
      ...s,
      startOffset: s.startOffset + body.bodyStart,
      endOffset: s.endOffset + body.bodyStart,
    }))
    steps.push(...buildSelectFlow(bodySegs, inner, dialect, body.name))
  }

  const mainSegs = segments.filter((s) => s.keyword !== 'WITH')
  steps.push(...buildSelectFlow(mainSegs, ast, dialect, undefined))

  return steps
}
