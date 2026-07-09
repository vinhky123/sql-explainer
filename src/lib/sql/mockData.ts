export type ColumnKind =
  | 'id' | 'ref' | 'name' | 'email' | 'date'
  | 'count' | 'money' | 'boolean' | 'category' | 'age' | 'string'

export interface InferredColumn {
  name: string
  kind: ColumnKind
  table: string
}

export interface InferredTable {
  realName: string
  name: string
  alias?: string
  columns: InferredColumn[]
}

export interface SourceColumn {
  key: string
  label: string
  name: string
  table: string
  kind: ColumnKind
}

export interface SourceRow {
  id: number
  values: Record<string, any>
}

export interface SourceTable {
  columns: SourceColumn[]
  rows: SourceRow[]
  tables: InferredTable[]
}

export function columnRefInfo(node: any): { table: string | null; name: string } | null {
  if (!node || node.type !== 'column_ref') return null
  const col = node.column
  let name: string
  if (typeof col === 'string') name = col
  else if (col?.expr?.value !== undefined) name = String(col.expr.value)
  else if (col?.value !== undefined) name = String(col.value)
  else return null
  return { table: node.table ?? null, name }
}

function inferKind(colName: string): ColumnKind {
  const n = colName.toLowerCase()
  if (n === 'id') return 'id'
  if (n.endsWith('_id')) return 'ref'
  if (/(name|title|label|username|login|first_name|last_name|full_name)/.test(n)) return 'name'
  if (/(email|mail)/.test(n)) return 'email'
  if (/(date|_at|time|timestamp|created|updated)/.test(n)) return 'date'
  if (/(count|qty|quantity|num|stock|inventory)/.test(n)) return 'count'
  if (/(price|amount|cost|total|salary|balance|fee|revenue|discount)/.test(n)) return 'money'
  if (/(active|enabled|is_|has_|flag|verified|paid|published|deleted)/.test(n)) return 'boolean'
  if (/(status|state|type|kind|category|tier|role|level|priority)/.test(n)) return 'category'
  if (/(^|_)age(_|$)/.test(n)) return 'age'
  return 'string'
}

function fallbackColumns(tableName: string): { name: string; kind: ColumnKind }[] {
  const t = tableName.toLowerCase()
  if (/(user|customer|member|account|people|person)/.test(t)) {
    return [
      { name: 'id', kind: 'id' },
      { name: 'name', kind: 'name' },
      { name: 'email', kind: 'email' },
      { name: 'status', kind: 'category' },
      { name: 'created_at', kind: 'date' },
    ]
  }
  if (/(order|invoice|transaction|payment|purchase)/.test(t)) {
    return [
      { name: 'id', kind: 'id' },
      { name: 'user_id', kind: 'ref' },
      { name: 'total', kind: 'money' },
      { name: 'status', kind: 'category' },
      { name: 'created_at', kind: 'date' },
    ]
  }
  if (/(product|item|article|book)/.test(t)) {
    return [
      { name: 'id', kind: 'id' },
      { name: 'name', kind: 'name' },
      { name: 'price', kind: 'money' },
      { name: 'stock', kind: 'count' },
      { name: 'category', kind: 'category' },
    ]
  }
  return [
    { name: 'id', kind: 'id' },
    { name: 'name', kind: 'name' },
    { name: 'created_at', kind: 'date' },
    { name: 'status', kind: 'category' },
  ]
}

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi']
const CATEGORIES = ['active', 'pending', 'closed', 'archived']
const MONEY_VALS = [19.99, 29.99, 9.99, 49.99, 99.99, 14.99, 4.99, 199.99]
const COUNT_VALS = [3, 7, 2, 5, 8, 1, 6, 4]
const AGE_VALS = [25, 30, 35, 28, 42, 31, 26, 38]
const STRINGS = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta']

export function genValue(kind: ColumnKind, i: number): any {
  const idx = i % 8
  switch (kind) {
    case 'id': return i + 1
    case 'ref': return (i % 5) + 1
    case 'name': return NAMES[idx]
    case 'email': return `${NAMES[idx].toLowerCase()}@example.com`
    case 'date': return `2024-0${(idx % 9) + 1}-${String((idx * 3) % 28 + 1).padStart(2, '0')}`
    case 'count': return COUNT_VALS[idx]
    case 'money': return MONEY_VALS[idx]
    case 'boolean': return idx % 3 !== 0
    case 'category': return CATEGORIES[idx % 4]
    case 'age': return AGE_VALS[idx]
    case 'string': return STRINGS[idx]
  }
}

function collectColumnRefsInto(node: any, acc: any[]) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach((n) => collectColumnRefsInto(n, acc)); return }
  if (node.type === 'column_ref') { acc.push(node); return }
  if (node.type === 'select' || node.ast) return
  for (const k of Object.keys(node)) {
    if (k === 'type') continue
    collectColumnRefsInto(node[k], acc)
  }
}

export function collectColumnRefs(ast: any): any[] {
  const acc: any[] = []
  if (ast.columns) ast.columns.forEach((c: any) => collectColumnRefsInto(c, acc))
  collectColumnRefsInto(ast.where, acc)
  collectColumnRefsInto(ast.having, acc)
  if (Array.isArray(ast.from)) ast.from.forEach((t: any) => collectColumnRefsInto(t.on, acc))
  if (ast.groupby?.columns) ast.groupby.columns.forEach((c: any) => collectColumnRefsInto(c, acc))
  if (Array.isArray(ast.orderby)) ast.orderby.forEach((o: any) => collectColumnRefsInto(o.expr, acc))
  return acc
}

function generateMockRows(table: InferredTable, count = 8): SourceRow[] {
  const rows: SourceRow[] = []
  for (let i = 0; i < count; i++) {
    const values: Record<string, any> = {}
    for (const col of table.columns) {
      values[`${table.name}.${col.name}`] = genValue(col.kind, i)
    }
    rows.push({ id: i, values })
  }
  return rows
}

function extractEqualities(node: any): { left: any; right: any }[] {
  if (!node) return []
  if (node.type === 'binary_expr') {
    const op = String(node.operator).toUpperCase()
    if (op === '=' || op === 'EQ') {
      if (node.left?.type === 'column_ref' && node.right?.type === 'column_ref') {
        return [
          { left: columnRefInfo(node.left), right: columnRefInfo(node.right) },
        ]
      }
    }
    if (op === 'AND') {
      return [...extractEqualities(node.left), ...extractEqualities(node.right)]
    }
  }
  return []
}

function resolveVal(info: { table: string | null; name: string } | null, row: Record<string, any>, tables: InferredTable[]): any {
  if (!info) return undefined
  if (info.table) {
    const t = tables.find((t) => t.name === info.table || t.realName === info.table || t.alias === info.table)
    return row[`${t?.name ?? info.table}.${info.name}`]
  }
  for (const t of tables) {
    const v = row[`${t.name}.${info.name}`]
    if (v !== undefined) return v
  }
  return undefined
}

function joinTables(perTable: { table: InferredTable; rows: SourceRow[] }[], from: any[], tables: InferredTable[]): SourceRow[] {
  let acc: Record<string, any>[] = perTable[0].rows.map((r) => ({ ...r.values }))
  for (let i = 1; i < perTable.length; i++) {
    const next = perTable[i]
    const pairs = extractEqualities(from[i]?.on)
    const out: Record<string, any>[] = []
    for (const lrow of acc) {
      for (const rrow of next.rows) {
        const merged = { ...lrow, ...rrow.values }
        const match = pairs.length === 0 || pairs.every((p) => {
          const lv = resolveVal(p.left, merged, tables)
          const rv = resolveVal(p.right, merged, tables)
          return lv === rv
        })
        if (match) {
          out.push(merged)
          if (out.length >= 12) break
        }
      }
      if (out.length >= 12) break
    }
    acc = out.length > 0 ? out : acc.slice(0, 8)
  }
  return acc.map((values, i) => ({ id: i, values }))
}

function resolveKeyLocal(info: { table: string | null; name: string } | null, tables: InferredTable[]): string | null {
  if (!info) return null
  if (info.table) {
    const t = tables.find((t) => t.name === info.table || t.realName === info.table || t.alias === info.table)
    return `${t?.name ?? info.table}.${info.name}`
  }
  for (const t of tables) {
    if (t.columns.find((c) => c.name === info.name)) return `${t.name}.${info.name}`
  }
  return tables[0] ? `${tables[0].name}.${info.name}` : null
}

function isLiteral(node: any): boolean {
  if (!node) return false
  return ['string', 'single_quote_string', 'number', 'bool', 'null'].includes(node.type)
}

function literalValue(node: any): any {
  if (!node) return undefined
  if (node.type === 'string' || node.type === 'single_quote_string') return node.value
  if (node.type === 'number') return Number(node.value)
  if (node.type === 'bool') return Boolean(node.value)
  if (node.type === 'null') return null
  return undefined
}

function isDateStr(s: any): boolean {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)
}

function shiftDate(s: string, days: number): string {
  const d = new Date(s + 'T00:00:00Z')
  if (isNaN(d.getTime())) return s
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function otherValue(lit: any, kind: ColumnKind): any {
  if (typeof lit === 'number') return lit + 1
  if (typeof lit === 'boolean') return !lit
  if (isDateStr(lit)) return shiftDate(lit, 1)
  if (typeof lit === 'string') {
    const dom = domainFor(kind).filter((v) => typeof v === 'string' && v !== lit)
    return dom[0] ?? lit + '~'
  }
  if (lit == null) return 'x'
  return lit
}

function below(lit: any, kind: ColumnKind): any {
  if (typeof lit === 'number') return lit - 1
  if (isDateStr(lit)) return shiftDate(lit, -1)
  if (typeof lit === 'string') {
    const dom = domainFor(kind).filter((v) => typeof v === 'string')
    return dom.find((v) => v < lit) ?? dom[0] ?? '!' + lit
  }
  return lit
}

function above(lit: any, kind: ColumnKind): any {
  if (typeof lit === 'number') return lit + 1
  if (isDateStr(lit)) return shiftDate(lit, 1)
  if (typeof lit === 'string') {
    const dom = domainFor(kind).filter((v) => typeof v === 'string')
    return dom.find((v) => v > lit) ?? dom[dom.length - 1] ?? '~' + lit
  }
  return lit
}

function reverseOp(op: string): string {
  switch (op) {
    case '<': case 'LT': return '>'
    case '>': case 'GT': return '<'
    case '<=': case 'LTE': return '>='
    case '>=': case 'GTE': return '<='
    default: return op
  }
}

interface Seed {
  colKey: string
  keeperValue: any
  nonKeeperValue: any
}

function makeSeed(op: string, key: string, lit: any, kind: ColumnKind): Seed | null {
  switch (op) {
    case '=': case 'EQ': return { colKey: key, keeperValue: lit, nonKeeperValue: otherValue(lit, kind) }
    case '!=': case '<>': case 'NEQ': return { colKey: key, keeperValue: otherValue(lit, kind), nonKeeperValue: lit }
    case '<': case 'LT': return { colKey: key, keeperValue: below(lit, kind), nonKeeperValue: lit }
    case '<=': case 'LTE': return { colKey: key, keeperValue: lit, nonKeeperValue: above(lit, kind) }
    case '>': case 'GT': return { colKey: key, keeperValue: above(lit, kind), nonKeeperValue: lit }
    case '>=': case 'GTE': return { colKey: key, keeperValue: lit, nonKeeperValue: below(lit, kind) }
  }
  return null
}

function nonInListValue(vals: any[], kind: ColumnKind): any {
  const dom = domainFor(kind)
  const alt = dom.find((v) => !vals.includes(v))
  if (alt !== undefined) return alt
  const sample = vals[0]
  if (typeof sample === 'number') return Math.max(...vals.map((v) => Number(v))) + 1
  return 'zzz_none'
}

function findColKind(key: string, tables: InferredTable[]): ColumnKind {
  const dot = key.lastIndexOf('.')
  const tname = dot >= 0 ? key.slice(0, dot) : ''
  const cname = dot >= 0 ? key.slice(dot + 1) : key
  const t = tables.find((tb) => tb.name === tname) ?? tables[0]
  const col = t?.columns.find((c) => c.name === cname)
  return col?.kind ?? 'string'
}

function collectSeeds(whereNode: any, tables: InferredTable[]): Seed[] {
  const seeds: Seed[] = []
  const visit = (node: any) => {
    if (!node) return
    if (node.type === 'binary_expr') {
      const op = String(node.operator).toUpperCase()
      if (op === 'AND' || op === 'OR') {
        visit(node.left)
        visit(node.right)
        return
      }
      if (op === 'IN' || op === 'NOT IN') {
        const info = columnRefInfo(node.left)
        const key = resolveKeyLocal(info, tables)
        const raw = node.right?.type === 'in_list' ? (node.right.value ?? []) : []
        const vals = raw.map(literalValue).filter((v: any) => v !== undefined)
        if (key && vals.length) {
          seeds.push({ colKey: key, keeperValue: vals[0], nonKeeperValue: nonInListValue(vals, findColKind(key, tables)) })
        }
        return
      }
      if (op === 'BETWEEN' || op === 'NOT BETWEEN') {
        const info = columnRefInfo(node.left)
        const key = resolveKeyLocal(info, tables)
        const lo = literalValue(node.right?.lo ?? node.right?.value?.[0])
        const hi = literalValue(node.right?.hi ?? node.right?.value?.[1])
        if (key && lo != null && hi != null) {
          const mid = typeof lo === 'number' ? (lo + hi) / 2 : lo
          seeds.push({ colKey: key, keeperValue: mid, nonKeeperValue: below(lo, findColKind(key, tables)) })
        }
        return
      }
      if (op === 'LIKE' || op === 'NOT LIKE') {
        const info = columnRefInfo(node.left)
        const key = resolveKeyLocal(info, tables)
        const pat = literalValue(node.right)
        if (key && typeof pat === 'string') {
          const sample = pat.replace(/%/g, 'x').replace(/_/g, 'y') || 'x'
          seeds.push({ colKey: key, keeperValue: sample, nonKeeperValue: 'zzz_none' })
        }
        return
      }
      if (op === 'IS' || op === 'IS NOT') {
        const info = columnRefInfo(node.left)
        const key = resolveKeyLocal(info, tables)
        if (key) {
          const wantNull = (op === 'IS' && node.right?.type === 'null') || (op === 'IS NOT' && node.right?.type !== 'null')
          seeds.push({ colKey: key, keeperValue: wantNull ? null : 'sample', nonKeeperValue: wantNull ? 'sample' : null })
        }
        return
      }
      if (node.left?.type === 'column_ref' && isLiteral(node.right)) {
        const info = columnRefInfo(node.left)
        const key = resolveKeyLocal(info, tables)
        const lit = literalValue(node.right)
        if (key && lit !== undefined) {
          const s = makeSeed(op, key, lit, findColKind(key, tables))
          if (s) seeds.push(s)
        }
        return
      }
      if (node.right?.type === 'column_ref' && isLiteral(node.left)) {
        const info = columnRefInfo(node.right)
        const key = resolveKeyLocal(info, tables)
        const lit = literalValue(node.left)
        if (key && lit !== undefined) {
          const s = makeSeed(reverseOp(op), key, lit, findColKind(key, tables))
          if (s) seeds.push(s)
        }
        return
      }
    }
  }
  visit(whereNode)
  return seeds
}

function domainFor(kind: ColumnKind): any[] {
  switch (kind) {
    case 'id': case 'ref': return [1, 2, 3]
    case 'name': return ['Alice', 'Bob', 'Carol']
    case 'email': return ['alice@x.com', 'bob@x.com', 'carol@x.com']
    case 'date': return ['2024-01-01', '2024-02-01', '2024-03-01']
    case 'count': return [1, 5, 10]
    case 'money': return [19.99, 49.99, 99.99]
    case 'boolean': return [true, false, true]
    case 'category': return ['active', 'pending', 'closed']
    case 'age': return [25, 30, 35]
    case 'string': return ['Alpha', 'Beta', 'Gamma']
  }
}

const KEEPER_ROWS = [0, 2, 4, 6]

function applySeedsAndGrouping(
  rows: SourceRow[],
  ast: any,
  tables: InferredTable[],
  columns: SourceColumn[],
): void {
  const hasWhere = !!ast.where
  const keeperSet = new Set(KEEPER_ROWS)
  const keeperList = KEEPER_ROWS.filter((i) => i < rows.length)

  const seeds = collectSeeds(ast.where, tables)
  const seededCols = new Set(seeds.map((s) => s.colKey))

  for (const seed of seeds) {
    for (let i = 0; i < rows.length; i++) {
      rows[i].values[seed.colKey] = keeperSet.has(i) ? seed.keeperValue : seed.nonKeeperValue
    }
  }

  const groupCols: string[] = (ast.groupby?.columns ?? [])
    .map((c: any) => resolveKeyLocal(columnRefInfo(c), tables))
    .filter((k: string | null): k is string => k != null)

  for (const gcol of groupCols) {
    if (seededCols.has(gcol)) continue
    const srcCol = columns.find((c) => c.key === gcol)
    const domain = domainFor(srcCol?.kind ?? 'string')
    for (let i = 0; i < rows.length; i++) {
      if (hasWhere) {
        if (keeperSet.has(i)) {
          const ki = keeperList.indexOf(i)
          rows[i].values[gcol] = domain[ki < keeperList.length - 1 ? 0 : 1]
        } else {
          rows[i].values[gcol] = domain[i % domain.length]
        }
      } else {
        rows[i].values[gcol] = domain[i % domain.length]
      }
    }
  }
}

export function buildSourceTable(ast: any): SourceTable | null {
  const from = Array.isArray(ast?.from) ? ast.from : []
  if (from.length === 0) return null

  const tables: InferredTable[] = from.map((t: any) => ({
    realName: String(t.table),
    name: t.as ?? String(t.table),
    alias: t.as,
    columns: [],
  }))
  const byName = new Map(tables.map((t) => [t.name, t]))
  const byReal = new Map(tables.map((t) => [t.realName, t]))

  const refs = collectColumnRefs(ast)
  for (const ref of refs) {
    const info = columnRefInfo(ref)
    if (!info || info.name === '*') continue
    let table: InferredTable | undefined
    if (info.table) table = byName.get(info.table) ?? byReal.get(info.table)
    else if (tables.length === 1) table = tables[0]
    if (!table) continue
    if (!table.columns.find((c) => c.name === info.name)) {
      table.columns.push({ name: info.name, kind: inferKind(info.name), table: table.name })
    }
  }

  for (const t of tables) {
    if (t.columns.length < 3) {
      const fb = fallbackColumns(t.realName)
      for (const f of fb) {
        if (t.columns.length >= 6) break
        if (!t.columns.find((c) => c.name === f.name)) {
          t.columns.push({ name: f.name, kind: f.kind, table: t.name })
        }
      }
    }
    const idIdx = t.columns.findIndex((c) => c.name === 'id')
    if (idIdx > 0) {
      const [idCol] = t.columns.splice(idIdx, 1)
      t.columns.unshift(idCol)
    }
  }

  const perTable = tables.map((t) => ({ table: t, rows: generateMockRows(t) }))

  const allColsRaw: { col: InferredColumn; key: string }[] = []
  for (const pt of perTable) {
    for (const col of pt.table.columns) {
      allColsRaw.push({ col, key: `${pt.table.name}.${col.name}` })
    }
  }
  const nameCount = new Map<string, number>()
  for (const c of allColsRaw) nameCount.set(c.col.name, (nameCount.get(c.col.name) ?? 0) + 1)
  const columns: SourceColumn[] = allColsRaw.map((c) => ({
    key: c.key,
    label: (nameCount.get(c.col.name) ?? 0) > 1 ? `${c.col.table}.${c.col.name}` : c.col.name,
    name: c.col.name,
    table: c.col.table,
    kind: c.col.kind,
  }))

  const rows = perTable.length === 1 ? perTable[0].rows : joinTables(perTable, from, tables)

  applySeedsAndGrouping(rows, ast, tables, columns)

  return { columns, rows, tables }
}
