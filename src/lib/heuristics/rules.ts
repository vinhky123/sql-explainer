import type { Finding } from '@/types'
import { hasJinja, stripJinja, remapToOriginal, type StripJinjaResult } from '@/lib/sql/jinja'

interface Locate {
  snippet: string
  startOffset: number
  endOffset: number
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function makeLocator(sql: string): (re: RegExp) => Locate | null {
  let cursor = 0
  return (re: RegExp): Locate | null => {
    const m = sql.slice(cursor).match(re)
    if (!m || m.index == null) return null
    const start = cursor + m.index
    cursor = start + m[0].length
    return { snippet: m[0], startOffset: start, endOffset: cursor }
  }
}

function locateLiteral(locate: (re: RegExp) => Locate | null, value: string): Locate | null {
  return locate(new RegExp(`'${escapeRegex(value)}'`, 'i'))
}

function colName(node: any): string {
  if (!node) return ''
  if (node.type === 'column_ref') {
    const c = node.column
    const name = typeof c === 'string' ? c : (c?.expr?.value ?? c?.value ?? '')
    const tbl = node.table ? `${node.table}.` : ''
    return `${tbl}${name}`
  }
  return ''
}

function isColumnRef(node: any): boolean {
  return node?.type === 'column_ref'
}

function isStringLiteral(node: any): boolean {
  return node?.type === 'single_quote_string' || node?.type === 'double_quote_string'
}

function walk(node: any, fn: (n: any) => void) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, fn))
    return
  }
  fn(node)
  for (const k of Object.keys(node)) {
    if (k === 'type') continue
    walk(node[k], fn)
  }
}

function isStarColumn(c: any): boolean {
  if (!c) return false
  if (c.type === 'star') return true
  if (c.expr?.type === 'star') return true
  if (c.expr?.column === '*') return true
  return false
}

function funcName(node: any): string {
  if (node?.name?.name) {
    return Array.isArray(node.name.name) ? node.name.name.map((n: any) => n.value).join('') : String(node.name.name)
  }
  return typeof node?.name === 'string' ? node.name : ''
}

function isCountStar(node: any): boolean {
  if (!node) return false
  const target = node.type === 'expr' ? node.expr : node
  return (
    target?.type === 'aggr_func' &&
    String(target.name).toUpperCase() === 'COUNT' &&
    (target.args?.expr?.type === 'star' || target.args?.expr?.column === '*')
  )
}

function hasCountStarCompareZero(node: any): boolean {
  let found = false
  walk(node, (n) => {
    if (found) return
    if (n?.type === 'binary_expr' && ['>', '>=', '<', '<=', '=', '!=', '<>'].includes(n.operator)) {
      const zeroSide = n.left?.type === 'number' && Number(n.left?.value) === 0 ? n.right : n.right?.type === 'number' && Number(n.right?.value) === 0 ? n.left : null
      if (zeroSide && isCountStar(zeroSide)) found = true
    }
  })
  return found
}

const NUMERIC_COL = /(^|_)(id|count|num|qty|amount|price|total|score|year|age|size|rating)$/i

type RuleRun = (sql: string, ast: any) => Finding[]
interface Rule {
  id: string
  severity: Finding['severity']
  title: string
  run: RuleRun
}

function base(rule: { id: string; severity: Finding['severity']; title: string; explanation: string; suggestion: string; rewrite?: string }, loc: Locate | null, extra: Partial<Finding> = {}): Finding {
  return {
    id: rule.id,
    severity: rule.severity,
    title: rule.title,
    explanation: rule.explanation,
    suggestion: rule.suggestion,
    rewrite: rule.rewrite,
    snippet: loc?.snippet,
    startOffset: loc?.startOffset,
    endOffset: loc?.endOffset,
    ...extra,
  }
}

const rules: Rule[] = [
  {
    id: 'select-star',
    severity: 'warning',
    title: 'SELECT * returns unnecessary columns',
    run: (sql, ast) => {
      if (!Array.isArray(ast.columns) || !ast.columns.some(isStarColumn)) return []
      const locate = makeLocator(sql)
      const loc = locate(/select\s+(?:distinct\s+)?\*/i)
      return [base({
        id: 'select-star', severity: 'warning', title: 'SELECT * returns unnecessary columns',
        explanation: 'SELECT * fetches every column, increasing I/O, memory, and network traffic. It also breaks refactors that rename columns.',
        suggestion: 'List the columns you actually need explicitly.',
      }, loc)]
    },
  },
  {
    id: 'like-leading-wildcard',
    severity: 'warning',
    title: 'LIKE with a leading wildcard cannot use an index',
    run: (sql, ast) => {
      const out: Finding[] = []
      const locate = makeLocator(sql)
      walk(ast.where, (n) => {
        if (n?.type === 'binary_expr' && (n.operator === 'LIKE' || n.operator === 'NOT LIKE')) {
          if (isStringLiteral(n.right)) {
            const v = n.right.value ?? ''
            if (v.startsWith('%') || v.startsWith('_')) {
              const loc = locateLiteral(locate, v)
              out.push(base({
                id: 'like-leading-wildcard', severity: 'warning',
                title: 'LIKE with a leading wildcard cannot use an index',
                explanation: `Pattern '${v}' starts with a wildcard, so the database must scan every row.`,
                suggestion: 'Use a trailing-only wildcard, a full-text index, or trigram (pg_trgm) for substring search.',
              }, loc, { id: `like-leading-wildcard-${colName(n.left)}` }))
            }
          }
        }
      })
      return out
    },
  },
  {
    id: 'function-on-column',
    severity: 'warning',
    title: 'Function on a column breaks index usage (non-sargable)',
    run: (sql, ast) => {
      const out: Finding[] = []
      if (!ast.where) return out
      const locate = makeLocator(sql)
      walk(ast.where, (n) => {
        if (n?.type === 'function' && n.args) {
          const args = Array.isArray(n.args.value) ? n.args.value : [n.args.expr]
          if (args.some(isColumnRef)) {
            const fn = funcName(n)
            const col = colName(args.find(isColumnRef))
            const colBare = col.split('.').pop() ?? ''
            let loc: Locate | null = null
            if (fn && colBare) {
              loc = locate(new RegExp(`${escapeRegex(fn)}\\s*\\([^)]*${escapeRegex(colBare)}[^)]*\\)`, 'i'))
            }
            out.push(base({
              id: 'function-on-column', severity: 'warning',
              title: 'Function on a column breaks index usage (non-sargable)',
              explanation: `Wrapping ${col} in ${fn}() prevents the optimizer from using any index on that column.`,
              suggestion: 'Rewrite the predicate as a range on the bare column, e.g. `created_at >= "2024-01-01" AND created_at < "2024-01-02"` instead of `DATE(created_at) = "2024-01-01"`.',
            }, loc, { id: `function-on-column-${col}` }))
          }
        }
      })
      return out
    },
  },
  {
    id: 'implicit-cast',
    severity: 'info',
    title: 'Implicit type cast in comparison',
    run: (sql, ast) => {
      const out: Finding[] = []
      const locate = makeLocator(sql)
      const check = (cond: any) => {
        if (cond?.type !== 'binary_expr' || cond.operator !== '=') return
        const lr = [[cond.left, cond.right], [cond.right, cond.left]]
        for (const [col, lit] of lr) {
          if (isColumnRef(col) && isStringLiteral(lit)) {
            const name = colName(col).split('.').pop() ?? ''
            if (NUMERIC_COL.test(name)) {
              const v = lit.value
              const loc = locateLiteral(locate, v)
              out.push(base({
                id: 'implicit-cast', severity: 'info',
                title: 'Implicit type cast in comparison',
                explanation: `Comparing numeric-looking column ${colName(col)} to a string literal '${v}' forces an implicit cast on every row.`,
                suggestion: 'Compare to a numeric literal of the matching type to allow index use.',
                rewrite: v,
              }, loc, { id: `implicit-cast-${name}` }))
            }
          }
        }
      }
      walk(ast.where, check)
      if (Array.isArray(ast.from)) {
        ast.from.forEach((f: any) => check(f?.on))
      }
      return out
    },
  },
  {
    id: 'or-across-columns',
    severity: 'warning',
    title: 'OR across different columns defeats single-column indexes',
    run: (sql, ast) => {
      const out: Finding[] = []
      if (!ast.where) return out
      const locate = makeLocator(sql)
      walk(ast.where, (n) => {
        if (n?.type === 'binary_expr' && n.operator === 'OR') {
          const lCol = firstColumn(n.left)
          const rCol = firstColumn(n.right)
          if (lCol && rCol && lCol !== rCol) {
            const loc = locate(/\bor\b/i)
            out.push(base({
              id: 'or-across-columns', severity: 'warning',
              title: 'OR across different columns defeats single-column indexes',
              explanation: `OR between conditions on ${lCol} and ${rCol} usually prevents index merging, forcing a full scan.`,
              suggestion: 'Rewrite as UNION of two indexed queries, or add a composite index covering both columns.',
            }, loc, { id: `or-across-columns-${lCol}-${rCol}` }))
          }
        }
      })
      return out
    },
  },
  {
    id: 'cartesian-join',
    severity: 'critical',
    title: 'Join without an ON condition (Cartesian product)',
    run: (sql, ast) => {
      const out: Finding[] = []
      if (!Array.isArray(ast.from) || ast.from.length < 2) return out
      const locate = makeLocator(sql)
      for (let i = 1; i < ast.from.length; i++) {
        const f = ast.from[i]
        if (!f?.on) {
          const loc = f?.join ? locate(/\bjoin\b/i) : locate(/,/)
          out.push(base({
            id: 'cartesian-join', severity: 'critical',
            title: 'Join without an ON condition (Cartesian product)',
            explanation: `Table "${f?.table ?? '?'}" is joined without a join condition, producing a full cross product of rows.`,
            suggestion: "Add an ON clause linking the tables' keys, or use an explicit CROSS JOIN only if intentional.",
          }, loc, { id: `cartesian-join-${f?.table ?? i}` }))
        }
      }
      return out
    },
  },
  {
    id: 'scalar-subquery',
    severity: 'info',
    title: 'Scalar subquery in SELECT — consider a JOIN',
    run: (_sql, ast) => {
      const out: Finding[] = []
      if (!Array.isArray(ast.columns)) return out
      for (const c of ast.columns) {
        if (c?.expr?.ast && c.expr.ast.type === 'select') {
          out.push({
            id: `scalar-subquery-${c.as ?? colName(c.expr.ast.columns?.[0])}`,
            severity: 'info',
            title: 'Scalar subquery in SELECT — consider a JOIN',
            explanation: 'A correlated subquery in the SELECT list runs once per row, which scales poorly.',
            suggestion: 'Rewrite as a LEFT JOIN to run the lookup once per driving table row.',
          })
        }
      }
      return out
    },
  },
  {
    id: 'not-in-subquery',
    severity: 'warning',
    title: 'NOT IN (subquery) is unsafe with NULLs',
    run: (sql, ast) => {
      const out: Finding[] = []
      const locate = makeLocator(sql)
      walk(ast.where, (n) => {
        if (n?.type === 'binary_expr' && n.operator === 'NOT IN') {
          const right = Array.isArray(n.right?.value) ? n.right.value : []
          if (right.some((v: any) => v?.ast)) {
            const loc = locate(/not\s+in\s*\(/i)
            out.push(base({
              id: 'not-in-subquery', severity: 'warning',
              title: 'NOT IN (subquery) is unsafe with NULLs',
              explanation: 'If the subquery returns any NULL, NOT IN returns no rows at all — a silent correctness bug.',
              suggestion: 'Use NOT EXISTS (SELECT 1 FROM ...) instead, which is NULL-safe and often faster.',
            }, loc, { id: `not-in-subquery-${colName(n.left)}` }))
          }
        }
      })
      return out
    },
  },
  {
    id: 'distinct-after-group-by',
    severity: 'info',
    title: 'DISTINCT is redundant after GROUP BY',
    run: (sql, ast) => {
      if (!ast.distinct?.type || !ast.groupby) return []
      const locate = makeLocator(sql)
      const loc = locate(/\bdistinct\b/i)
      return [base({
        id: 'distinct-after-group-by', severity: 'info',
        title: 'DISTINCT is redundant after GROUP BY',
        explanation: 'GROUP BY already produces unique groups, so DISTINCT adds a needless sort/dedup pass.',
        suggestion: 'Remove the DISTINCT keyword.',
        rewrite: '',
      }, loc)]
    },
  },
  {
    id: 'order-by-limit',
    severity: 'info',
    title: 'ORDER BY ... LIMIT without a supporting index',
    run: (sql, ast) => {
      const hasLimit = Array.isArray(ast.limit?.value) && ast.limit.value.length > 0
      if (!Array.isArray(ast.orderby) || !ast.orderby.length || !hasLimit) return []
      const locate = makeLocator(sql)
      const loc = locate(/order\s+by/i)
      return [base({
        id: 'order-by-limit', severity: 'info',
        title: 'ORDER BY ... LIMIT without a supporting index',
        explanation: 'Sorting then taking a few rows can be expensive on large inputs.',
        suggestion: 'Add an index on the ORDER BY columns (matching direction) so the planner can return top-N rows directly.',
      }, loc)]
    },
  },
  {
    id: 'large-in-list',
    severity: 'info',
    title: 'Large IN (...) list',
    run: (sql, ast) => {
      const out: Finding[] = []
      const threshold = 20
      const locate = makeLocator(sql)
      walk(ast.where, (n) => {
        if (n?.type === 'binary_expr' && n.operator === 'IN' && Array.isArray(n.right?.value)) {
          const vals = n.right.value.filter((v: any) => !v?.ast)
          if (vals.length >= threshold) {
            const loc = locate(/\bin\s*\(/i)
            out.push(base({
              id: 'large-in-list', severity: 'info',
              title: 'Large IN (...) list',
              explanation: `An IN list with ${vals.length} values forces the planner to evaluate each value; very long lists bloat the plan and parse time.`,
              suggestion: 'Load the values into a temp table or use a JOIN / EXISTS against it for large sets.',
            }, loc, { id: `large-in-list-${colName(n.left)}` }))
          }
        }
      })
      return out
    },
  },
  {
    id: 'count-star-exists',
    severity: 'info',
    title: 'COUNT(*) for an existence check — use EXISTS',
    run: (sql, ast) => {
      const out: Finding[] = []
      const noGroupBy = !ast.groupby || !Array.isArray(ast.groupby.columns) || ast.groupby.columns.length === 0
      const cols = Array.isArray(ast.columns) ? ast.columns : []
      const bareCountExists = noGroupBy && cols.length === 1 && isCountStar(cols[0]) && !!ast.where
      const havingCountZero = noGroupBy && hasCountStarCompareZero(ast.having)
      if (bareCountExists || havingCountZero) {
        const locate = makeLocator(sql)
        const loc = locate(/count\s*\(\s*\*\s*\)/i)
        out.push(base({
          id: 'count-star-exists', severity: 'info',
          title: 'COUNT(*) for an existence check — use EXISTS',
          explanation: 'When you only need to know whether any row exists, COUNT(*) scans the full matching set.',
          suggestion: 'Use EXISTS (SELECT 1 FROM ... WHERE ...) — it short-circuits at the first match.',
        }, loc, { id: 'count-star-exists' }))
      }
      return out
    },
  },
]

function firstColumn(node: any): string {
  let found = ''
  walk(node, (n) => {
    if (!found && isColumnRef(n)) found = colName(n).split('.').pop() ?? ''
  })
  return found
}

export function runHeuristics(sql: string, astArray: any): Finding[] {
  if (!astArray) return []
  const stmts = Array.isArray(astArray) ? astArray : [astArray]
  const stripped: StripJinjaResult | null = hasJinja(sql) ? stripJinja(sql) : null
  const scanSql = stripped ? stripped.stripped : sql
  const findings: Finding[] = []
  for (const stmt of stmts) {
    if (!stmt || stmt.type !== 'select') continue
    let cur: any = stmt
    const seen = new Set<any>()
    while (cur && cur.type === 'select' && !seen.has(cur)) {
      seen.add(cur)
      for (const rule of rules) {
        try {
          const ruleFindings = rule.run(scanSql, cur)
          if (stripped) {
            for (const f of ruleFindings) {
              if (f.startOffset != null) f.startOffset = remapToOriginal(stripped, f.startOffset)
              if (f.endOffset != null) f.endOffset = remapToOriginal(stripped, f.endOffset)
              if (f.snippet != null && f.startOffset != null && f.endOffset != null) {
                f.snippet = sql.slice(f.startOffset, f.endOffset)
              }
            }
          }
          findings.push(...ruleFindings)
        } catch {
          // a rule failing must not break the others
        }
      }
      cur = cur._next
    }
  }
  return findings
}
