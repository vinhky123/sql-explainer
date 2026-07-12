import type { FlowStep } from './executionOrder'
import type { ParseResult } from './parser'
import type { Dialect } from '@/types'
import { isAggregateName, funcNameOf } from './functions'
import {
  buildSourceTable, columnRefInfo,
  type SourceTable, type InferredTable, type ColumnKind,
} from './mockData'
import { evalExpr, makeRowGet, truthy, compare } from './evalExpr'

export interface SnapColumn {
  label: string
  kind: ColumnKind
  dimmed: boolean
  isAgg: boolean
  highlighted: boolean
}

export interface SnapRow {
  id: number
  cells: string[]
  dimmed: boolean
  groupSize?: number
}

export interface TableSnapshot {
  columns: SnapColumn[]
  rows: SnapRow[]
  grouped: boolean
  badge: string
}

export interface SnapshotResult {
  snapshots: (TableSnapshot | null)[]
  source: SourceTable
}

interface WorkCol {
  key: string
  label: string
  name: string
  table: string
  kind: ColumnKind
  alive: boolean
  isAgg: boolean
}

interface WorkRow {
  id: number
  values: Record<string, any>
  alive: boolean
  groupSize?: number
  members?: WorkRow[]
}

interface WorkState {
  columns: WorkCol[]
  rows: WorkRow[]
  grouped: boolean
  groupCols?: string[]
}

function resolveKey(node: any, tables: InferredTable[]): string | null {
  const info = columnRefInfo(node)
  if (!info) return null
  if (info.table) {
    const t = tables.find((t) => t.name === info.table || t.realName === info.table || t.alias === info.table)
    return `${t?.name ?? info.table}.${info.name}`
  }
  for (const t of tables) {
    if (t.columns.find((c) => c.name === info.name)) return `${t.name}.${info.name}`
  }
  return tables[0] ? `${tables[0].name}.${info.name}` : info.name
}

function hasAggr(node: any, dialect: Dialect = 'postgresql'): boolean {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some((n) => hasAggr(n, dialect))
  if (node.type === 'aggr_func') return true
  if (node.type === 'function' && isAggregateName(funcNameOf(node), dialect)) return true
  if (node.type === 'select' || node.ast) return false
  for (const k of Object.keys(node)) {
    if (k === 'type') continue
    if (hasAggr(node[k], dialect)) return true
  }
  return false
}

function formatAggrLabel(node: any): string {
  const name = node.name
  const inner = node.args?.expr
  if (inner?.type === 'star') return `${name}(*)`
  const info = columnRefInfo(inner)
  if (info) return `${name}(${info.name})`
  return `${name}(…)`
}

function shortLabel(node: any): string {
  const info = columnRefInfo(node)
  if (info) return info.name
  if (node?.type === 'number') return String(node.value)
  if (node?.type === 'string' || node?.type === 'single_quote_string') return `'${node.value}'`
  return '?'
}

function formatExprLabel(node: any): string {
  if (!node) return 'expr'
  if (node.type === 'number') return String(node.value)
  if (node.type === 'string' || node.type === 'single_quote_string') return `'${node.value}'`
  if (node.type === 'column_ref') {
    const info = columnRefInfo(node)
    return info ? info.name : 'col'
  }
  if (node.type === 'aggr_func') return formatAggrLabel(node)
  if (node.type === 'binary_expr') return `${shortLabel(node.left)} ${node.operator} ${shortLabel(node.right)}`
  return 'expr'
}

function aggrKind(node: any, srcCols: WorkCol[]): ColumnKind {
  const name = String(node.name).toUpperCase()
  if (name === 'COUNT') return 'count'
  const info = columnRefInfo(node.args?.expr)
  if (info) {
    const src = srcCols.find((c) => c.name === info.name)
    if (src) return src.kind === 'money' ? 'money' : 'count'
  }
  return 'count'
}

function formatValue(v: any, kind: ColumnKind): string {
  if (v == null) return 'NULL'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (kind === 'money' && typeof v === 'number') return v.toFixed(2)
  if (typeof v === 'number' && Number.isInteger(v)) return String(v)
  if (typeof v === 'number') return String(Math.round(v * 100) / 100)
  return String(v)
}

function applyWhere(prev: WorkState, ast: any, tables: InferredTable[]): WorkState {
  if (!ast.where) return prev
  const rows = prev.rows.map((r) => {
    if (!r.alive) return r
    const get = makeRowGet(r.values, tables)
    const ok = truthy(evalExpr(ast.where, { get, tables }))
    return { ...r, alive: ok }
  })
  return { ...prev, rows }
}

function applyGroupBy(prev: WorkState, ast: any, tables: InferredTable[]): WorkState {
  const groupCols: string[] = (ast.groupby?.columns ?? [])
    .map((c: any) => resolveKey(c, tables))
    .filter((k: string | null): k is string => k != null)
  const aliveRows = prev.rows.filter((r) => r.alive)
  if (groupCols.length === 0 || aliveRows.length === 0) return prev

  const map = new Map<string, { rowIds: number[] }>()
  for (const r of aliveRows) {
    const parts = groupCols.map((k) => String(r.values[k]))
    const kstr = parts.join('\0')
    let g = map.get(kstr)
    if (!g) { g = { rowIds: [] }; map.set(kstr, g) }
    g.rowIds.push(r.id)
  }

  const groups = [...map.values()]
  const byId = new Map(aliveRows.map((r) => [r.id, r]))
  const newRows: WorkRow[] = groups.map((g, i) => {
    const members = g.rowIds.map((id) => byId.get(id)!).filter(Boolean)
    const first = members[0]
    return {
      id: 1000 + i,
      values: { ...first.values },
      alive: true,
      groupSize: members.length,
      members,
    }
  })

  return { ...prev, rows: newRows, grouped: true, groupCols }
}

function applyHaving(prev: WorkState, ast: any, tables: InferredTable[]): WorkState {
  if (!ast.having) return prev
  const rows = prev.rows.map((r) => {
    if (!r.alive || !r.members) return r
    const get = makeRowGet(r.values, tables)
    const ok = truthy(evalExpr(ast.having, { get, rows: r.members, tables }))
    return { ...r, alive: ok }
  })
  return { ...prev, rows }
}

function computeSelectValues(
  cols: any[],
  members: WorkRow[],
  groupValues: Record<string, any>,
  tables: InferredTable[],
  dialect: Dialect,
): Record<string, any> {
  const out: Record<string, any> = {}
  cols.forEach((c: any, i: number) => {
    const expr = c.expr
    const info = columnRefInfo(expr)
    if (info) {
      const key = resolveKey(expr, tables) ?? `${info.table ?? ''}.${info.name}`
      out[key] = groupValues[key] ?? members[0]?.values[key]
      return
    }
    if (expr?.type === 'aggr_func' || (expr?.type === 'function' && isAggregateName(funcNameOf(expr), dialect))) {
      out[`__agg_${i}`] = evalExpr(expr, { get: makeRowGet(groupValues, tables), rows: members, tables })
      return
    }
    out[`__expr_${i}`] = evalExpr(expr, { get: makeRowGet(groupValues, tables), rows: members, tables })
  })
  return out
}

function applySelect(prev: WorkState, ast: any, tables: InferredTable[], dialect: Dialect): WorkState {
  const cols = ast.columns
  if (!Array.isArray(cols) || cols.length === 0) return prev

  const isStar = cols.some(
    (c: any) => c.type === 'star' || (c.expr?.type === 'column_ref' && columnRefInfo(c.expr)?.name === '*'),
  )
  const hasAggregates = prev.grouped || cols.some((c: any) => hasAggr(c.expr, dialect))

  let outCols: WorkCol[]
  if (isStar) {
    outCols = prev.columns.map((c) => ({ ...c, alive: true, isAgg: false }))
  } else {
    outCols = cols.map((c: any, i: number) => {
      const alias = c.as
      const expr = c.expr
      const info = columnRefInfo(expr)
      if (info) {
        const key = resolveKey(expr, tables) ?? `${info.table ?? ''}.${info.name}`
        const src = prev.columns.find((sc) => sc.key === key) ?? prev.columns.find((sc) => sc.name === info.name)
        return {
          key: src?.key ?? key,
          label: alias ?? src?.label ?? info.name,
          name: src?.name ?? info.name,
          table: src?.table ?? '',
          kind: src?.kind ?? 'string',
          alive: true,
          isAgg: false,
        }
      }
      if (expr?.type === 'aggr_func' || (expr?.type === 'function' && isAggregateName(funcNameOf(expr), dialect))) {
        const label = alias ?? formatAggrLabel(expr)
        return { key: `__agg_${i}`, label, name: label, table: '', kind: aggrKind(expr, prev.columns), alive: true, isAgg: true }
      }
      const label = alias ?? formatExprLabel(expr)
      return { key: `__expr_${i}`, label, name: label, table: '', kind: 'string', alive: true, isAgg: false }
    })
  }

  const outKeys = new Set(outCols.map((c) => c.key))
  const dimmedExtras = prev.columns.filter((c) => !outKeys.has(c.key)).map((c) => ({ ...c, alive: false }))
  const columns = [...outCols, ...dimmedExtras]

  let rows: WorkRow[]
  if (hasAggregates && !isStar) {
    if (prev.grouped) {
      rows = prev.rows.map((r) => {
        const newValues = computeSelectValues(cols, r.members ?? [r], r.values, tables, dialect)
        return { ...r, values: { ...r.values, ...newValues } }
      })
    } else {
      const aliveRows = prev.rows.filter((r) => r.alive)
      const members = aliveRows.length > 0 ? aliveRows : prev.rows
      const groupValues = members[0]?.values ?? {}
      const newValues = computeSelectValues(cols, members, groupValues, tables, dialect)
      rows = [{ id: 5000, values: { ...groupValues, ...newValues }, alive: true, groupSize: members.length }]
    }
  } else if (isStar) {
    rows = prev.rows
  } else {
    rows = prev.rows.map((r) => {
      if (!r.alive) return r
      const newValues = computeSelectValues(cols, [r], r.values, tables, dialect)
      return { ...r, values: { ...r.values, ...newValues } }
    })
  }

  return { ...prev, columns, rows, grouped: prev.grouped || (hasAggregates && !prev.grouped) }
}

function applyDistinct(prev: WorkState): WorkState {
  const seen = new Set<string>()
  const rows = prev.rows.map((r) => {
    if (!r.alive) return r
    const sig = prev.columns.filter((c) => c.alive).map((c) => String(r.values[c.key] ?? '')).join('\0')
    if (seen.has(sig)) return { ...r, alive: false }
    seen.add(sig)
    return r
  })
  return { ...prev, rows }
}

function applyOrderBy(prev: WorkState, ast: any, tables: InferredTable[]): WorkState {
  const orders = (ast.orderby ?? [])
    .map((o: any) => ({ key: resolveKey(o.expr, tables), dir: String(o.type || 'ASC').toUpperCase() }))
    .filter((o: { key: string | null }) => o.key != null)
  if (orders.length === 0) return prev
  const alive = prev.rows.filter((r) => r.alive)
  const dead = prev.rows.filter((r) => !r.alive)
  alive.sort((a, b) => {
    for (const o of orders) {
      const c = compare(a.values[o.key!], b.values[o.key!])
      if (c !== 0) return o.dir === 'DESC' ? -c : c
    }
    return 0
  })
  return { ...prev, rows: [...alive, ...dead] }
}

function applyLimit(prev: WorkState, ast: any): WorkState {
  const n = ast.limit?.value?.[0]?.value
  if (typeof n !== 'number') return prev
  let kept = 0
  const rows = prev.rows.map((r) => {
    if (!r.alive) return r
    if (kept >= n) return { ...r, alive: false }
    kept++
    return r
  })
  return { ...prev, rows }
}

function applyOffset(prev: WorkState, ast: any): WorkState {
  const raw = ast.offset?.value?.value ?? ast.offset?.value?.[0]?.value
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return prev
  let skipped = 0
  const rows = prev.rows.map((r) => {
    if (!r.alive) return r
    if (skipped < n) { skipped++; return { ...r, alive: false } }
    return r
  })
  return { ...prev, rows }
}

function applyStep(prev: WorkState, step: FlowStep, ast: any, tables: InferredTable[], dialect: Dialect): WorkState {
  switch (step.id) {
    case 'WHERE': return applyWhere(prev, ast, tables)
    case 'GROUP BY': return applyGroupBy(prev, ast, tables)
    case 'HAVING': return applyHaving(prev, ast, tables)
    case 'SELECT': return applySelect(prev, ast, tables, dialect)
    case 'DISTINCT': return applyDistinct(prev)
    case 'ORDER BY': return applyOrderBy(prev, ast, tables)
    case 'LIMIT': return applyLimit(prev, ast)
    case 'OFFSET': return applyOffset(prev, ast)
    default: return prev
  }
}

function getReferencedKeys(step: FlowStep, ast: any, tables: InferredTable[]): Set<string> {
  const keys = new Set<string>()
  const add = (node: any) => {
    const refs: any[] = []
    const visit = (n: any) => {
      if (!n || typeof n !== 'object') return
      if (Array.isArray(n)) { n.forEach(visit); return }
      if (n.type === 'column_ref') { refs.push(n); return }
      if (n.type === 'select' || n.ast) return
      for (const k of Object.keys(n)) {
        if (k === 'type') continue
        visit(n[k])
      }
    }
    visit(node)
    for (const r of refs) {
      const k = resolveKey(r, tables)
      if (k) keys.add(k)
    }
  }
  switch (step.id) {
    case 'WHERE': add(ast.where); break
    case 'GROUP BY': (ast.groupby?.columns ?? []).forEach(add); break
    case 'HAVING': add(ast.having); break
    case 'SELECT': (ast.columns ?? []).forEach((c: any) => add(c.expr)); break
    case 'ORDER BY': (ast.orderby ?? []).forEach((o: any) => add(o.expr)); break
    default: break
  }
  return keys
}

function toSnapshot(st: WorkState, step: FlowStep, ast: any, tables: InferredTable[]): TableSnapshot {
  const groupCols = st.groupCols ?? []
  const referenced = getReferencedKeys(step, ast, tables)
  const columns: SnapColumn[] = st.columns.map((c) => ({
    label: c.label,
    kind: c.kind,
    dimmed: !c.alive,
    isAgg: c.isAgg,
    highlighted: referenced.has(c.key) || referenced.has(c.name),
  }))
  const rows: SnapRow[] = st.rows.map((r) => ({
    id: r.id,
    cells: st.columns.map((c) => {
      if (st.grouped && r.groupSize != null && !groupCols.includes(c.key) && !c.isAgg && c.alive) {
        return '…'
      }
      return formatValue(r.values[c.key], c.kind)
    }),
    dimmed: !r.alive,
    groupSize: r.groupSize,
  }))
  const visible = rows.filter((r) => !r.dimmed).length
  const total = rows.length
  const badge = st.grouped
    ? `${visible} group${visible !== 1 ? 's' : ''}`
    : `${visible} / ${total} row${total !== 1 ? 's' : ''}`
  return { columns, rows, grouped: st.grouped, badge }
}

function seedScopeState(
  scopeAst: any,
  dialect: Dialect,
  cteResults: Map<string, WorkState>,
): { state: WorkState; tables: InferredTable[] } | null {
  void dialect
  const from0 = scopeAst.from?.[0]
  if (!from0 || !from0.table) return null
  const cteSeed = cteResults.get(String(from0.table))
  if (cteSeed) {
    const columns: WorkCol[] = cteSeed.columns
      .filter((c) => c.alive)
      .map((c) => ({ ...c, alive: true, isAgg: false }))
    const rows: WorkRow[] = cteSeed.rows
      .filter((r) => r.alive)
      .map((r, i) => ({ id: i, values: { ...r.values }, alive: true }))
    const tables: InferredTable[] = [{
      realName: String(from0.table),
      name: from0.as ?? String(from0.table),
      alias: from0.as,
      columns: columns.map((c) => ({ name: c.name, kind: c.kind, table: c.name })),
    }]
    if (columns.length === 0 || rows.length === 0) return null
    return { state: { columns, rows, grouped: false }, tables }
  }
  const source = buildSourceTable(scopeAst)
  if (!source || source.columns.length === 0 || source.rows.length === 0) return null
  const tables = source.tables
  const state: WorkState = {
    columns: source.columns.map((c) => ({ ...c, alive: true, isAgg: false })),
    rows: source.rows.map((r) => ({ id: r.id, values: { ...r.values }, alive: true })),
    grouped: false,
  }
  return { state, tables }
}

function snapshotScope(
  scopeSteps: FlowStep[],
  scopeAst: any,
  dialect: Dialect,
  cteResults: Map<string, WorkState>,
): { snaps: TableSnapshot[]; final: WorkState; seedTables: InferredTable[] } | null {
  const seeded = seedScopeState(scopeAst, dialect, cteResults)
  if (!seeded) return null
  const { state: seed, tables } = seeded
  const states: WorkState[] = [seed]
  let cur = seed
  for (let i = 1; i < scopeSteps.length; i++) {
    cur = applyStep(cur, scopeSteps[i], scopeAst, tables, dialect)
    states.push(cur)
  }
  return { snaps: states.map((st, i) => toSnapshot(st, scopeSteps[i], scopeAst, tables)), final: cur, seedTables: tables }
}

export function buildSnapshots(
  steps: FlowStep[],
  parse: ParseResult,
  sql: string,
): SnapshotResult | null {
  if (!sql.trim()) return null
  if (!parse.ok || !parse.ast) return null
  const mainAst = Array.isArray(parse.ast) ? parse.ast[0] : parse.ast
  if (!mainAst || mainAst.type !== 'select') return null
  const dialect: Dialect = parse.dialect ?? 'postgresql'

  const cteAst = new Map<string, any>()
  if (Array.isArray(mainAst.with)) {
    for (const cte of mainAst.with) {
      const name = cte.name?.value ?? cte.name
      const inner = cte.stmt?.ast ?? cte.stmt
      if (name && inner?.type === 'select' && !inner._next && inner.from?.[0]?.table) {
        cteAst.set(String(name), inner)
      }
    }
  }

  interface Scope { cte: string | undefined; steps: FlowStep[] }
  const scopes: Scope[] = []
  for (const step of steps) {
    const last = scopes[scopes.length - 1]
    if (last && last.cte === step.cte) last.steps.push(step)
    else scopes.push({ cte: step.cte, steps: [step] })
  }

  const cteResults = new Map<string, WorkState>()
  const snapshots: (TableSnapshot | null)[] = []
  let mainSource: SourceTable | null = null

  for (const scope of scopes) {
    const scopeAst = scope.cte == null ? mainAst : cteAst.get(scope.cte)
    if (!scopeAst) {
      snapshots.push(...scope.steps.map(() => null))
      continue
    }
    const result = snapshotScope(scope.steps, scopeAst, dialect, cteResults)
    if (result === null) {
      snapshots.push(...scope.steps.map(() => null))
      continue
    }
    snapshots.push(...result.snaps)
    if (scope.cte) cteResults.set(scope.cte, result.final)
    if (scope.cte == null && mainSource === null) {
      const src = buildSourceTable(mainAst)
      if (src) {
        mainSource = src
      } else {
        mainSource = {
          columns: result.final.columns
            .filter((c) => c.alive)
            .map((c) => ({ key: c.key, label: c.label, name: c.name, table: c.table, kind: c.kind })),
          rows: result.final.rows
            .filter((r) => r.alive)
            .map((r) => ({ id: r.id, values: { ...r.values } })),
          tables: result.seedTables,
        }
      }
    }
  }

  if (mainSource === null) return null
  return { snapshots, source: mainSource }
}
