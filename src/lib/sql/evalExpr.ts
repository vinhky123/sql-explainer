import { columnRefInfo, type InferredTable } from './mockData'

export interface EvalContext {
  get: (table: string | null, name: string) => any
  rows?: { values: Record<string, any> }[]
  tables?: InferredTable[]
}

export function truthy(v: any): boolean {
  return v != null && v !== false && v !== 0 && v !== ''
}

export function toNum(v: any): number {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

function toNumIfPossible(v: any): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v)
  if (typeof v === 'boolean') return v ? 1 : 0
  return undefined
}

export function looseEqual(a: any, b: any): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b
  const an = toNumIfPossible(a), bn = toNumIfPossible(b)
  if (typeof an === 'number' && typeof bn === 'number') return an === bn
  return String(a) === String(b)
}

export function compare(a: any, b: any): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  const an = toNumIfPossible(a), bn = toNumIfPossible(b)
  if (typeof an === 'number' && typeof bn === 'number') return an - bn
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function likeMatch(s: string, pattern: string): boolean {
  const re = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$'
  return new RegExp(re, 'i').test(s)
}

function rowLookup(values: Record<string, any>, table: string | null, col: string, tables?: InferredTable[]): any {
  if (table) {
    const t = tables?.find((t) => t.name === table || t.realName === table || t.alias === table)
    return values[`${t?.name ?? table}.${col}`]
  }
  if (tables) {
    for (const t of tables) {
      if (values[`${t.name}.${col}`] !== undefined) return values[`${t.name}.${col}`]
    }
  }
  return undefined
}

export function makeRowGet(values: Record<string, any>, tables?: InferredTable[]) {
  return (table: string | null, col: string) => rowLookup(values, table, col, tables)
}

function inList(l: any, rightNode: any, ctx: EvalContext): boolean {
  if (!rightNode) return false
  if (rightNode.ast) return true
  const arr = rightNode.type === 'in_list' ? (rightNode.value ?? []) : [rightNode]
  const vals = arr.map((v: any) => evalExpr(v, ctx))
  return vals.some((v: any) => looseEqual(l, v))
}

function between(l: any, rightNode: any, ctx: EvalContext): boolean {
  if (!rightNode) return false
  let lo: any, hi: any
  if (rightNode.type === 'between') {
    if (rightNode.lo != null) {
      lo = evalExpr(rightNode.lo, ctx)
      hi = evalExpr(rightNode.hi, ctx)
    } else if (Array.isArray(rightNode.value)) {
      lo = evalExpr(rightNode.value[0], ctx)
      hi = evalExpr(rightNode.value[1], ctx)
    }
  }
  return lo != null && hi != null && compare(l, lo) >= 0 && compare(l, hi) <= 0
}

function computeAggregate(node: any, ctx: EvalContext): any {
  const name = String(node.name).toUpperCase()
  const rows = ctx.rows ?? []
  const inner = node.args?.expr
  const tables = ctx.tables
  const values = rows.map((r) => {
    const rowGet = makeRowGet(r.values, tables)
    return evalExpr(inner, { get: rowGet, rows: [r], tables })
  })
  switch (name) {
    case 'COUNT':
      if (inner?.type === 'star') return rows.length
      return values.filter((v) => v != null).length
    case 'SUM':
      return values
        .filter((v) => v != null && toNumIfPossible(v) !== undefined)
        .reduce((a, v) => a + toNum(v), 0)
    case 'AVG': {
      const nums = values.filter((v) => v != null && toNumIfPossible(v) !== undefined).map(toNum)
      return nums.length ? nums.reduce((a, v) => a + v, 0) / nums.length : null
    }
    case 'MIN': {
      const nums = values.filter((v) => v != null)
      if (!nums.length) return null
      return nums.reduce((a, v) => (compare(a, v) <= 0 ? a : v))
    }
    case 'MAX': {
      const nums = values.filter((v) => v != null)
      if (!nums.length) return null
      return nums.reduce((a, v) => (compare(a, v) >= 0 ? a : v))
    }
    default:
      return null
  }
}

function evalBinary(node: any, ctx: EvalContext): any {
  const op = String(node.operator).toUpperCase()
  if (op === 'AND') return truthy(evalExpr(node.left, ctx)) && truthy(evalExpr(node.right, ctx))
  if (op === 'OR') return truthy(evalExpr(node.left, ctx)) || truthy(evalExpr(node.right, ctx))
  const l = evalExpr(node.left, ctx)
  const r = evalExpr(node.right, ctx)
  switch (op) {
    case '=': case 'EQ': return looseEqual(l, r)
    case '!=': case '<>': case 'NEQ': return !looseEqual(l, r)
    case '<': case 'LT': return compare(l, r) < 0
    case '>': case 'GT': return compare(l, r) > 0
    case '<=': case 'LTE': return compare(l, r) <= 0
    case '>=': case 'GTE': return compare(l, r) >= 0
    case '+': return toNum(l) + toNum(r)
    case '-': return toNum(l) - toNum(r)
    case '*': return toNum(l) * toNum(r)
    case '/': return toNum(r) !== 0 ? toNum(l) / toNum(r) : null
    case '%': return toNum(r) !== 0 ? toNum(l) % toNum(r) : null
    case 'LIKE': return likeMatch(String(l ?? ''), String(r ?? ''))
    case 'NOT LIKE': return !likeMatch(String(l ?? ''), String(r ?? ''))
    case 'IN': return inList(l, node.right, ctx)
    case 'NOT IN': return !inList(l, node.right, ctx)
    case 'BETWEEN': return between(l, node.right, ctx)
    case 'NOT BETWEEN': return !between(l, node.right, ctx)
    case 'IS': return node.right?.type === 'null' ? (l == null) : looseEqual(l, r)
    case 'IS NOT': return node.right?.type === 'null' ? (l != null) : !looseEqual(l, r)
    default: return true
  }
}

export function evalExpr(node: any, ctx: EvalContext): any {
  if (node == null) return true
  const t = node.type
  if (t === 'column_ref') {
    const info = columnRefInfo(node)
    if (!info) return null
    return ctx.get(info.table, info.name)
  }
  if (t === 'string' || t === 'single_quote_string') return node.value
  if (t === 'number') return Number(node.value)
  if (t === 'bool') return Boolean(node.value)
  if (t === 'null') return null
  if (t === 'star') return null
  if (t === 'aggr_func') return computeAggregate(node, ctx)
  if (t === 'binary_expr') return evalBinary(node, ctx)
  if (t === 'unary_expr') {
    const op = String(node.operator).toUpperCase()
    if (op === 'NOT') return !truthy(evalExpr(node.expr, ctx))
    if (op === '-') return -toNum(evalExpr(node.expr, ctx))
    return evalExpr(node.expr, ctx)
  }
  if (t === 'paren_expr' || t === 'expr') return evalExpr(node.expr ?? node.value, ctx)
  if (t === 'in_list') return (node.value ?? []).map((v: any) => evalExpr(v, ctx))
  return true
}
