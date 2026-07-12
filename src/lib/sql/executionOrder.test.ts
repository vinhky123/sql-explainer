import { describe, it, expect } from 'vitest'
import { splitClauses } from './clauseSplitter'
import { buildExecutionFlow, buildSelectFlow } from './executionOrder'
import { parseSql } from './parser'

function flow(sql: string) {
  const parse = parseSql(sql, 'postgresql')
  return buildExecutionFlow(splitClauses(sql), parse, sql)
}

function flowDialect(sql: string, dialect: Parameters<typeof parseSql>[1]) {
  const parse = parseSql(sql, dialect)
  return buildExecutionFlow(splitClauses(sql), parse, sql)
}

function descriptions(sql: string): string[] {
  return flow(sql).map((s) => s.description)
}

describe('buildExecutionFlow (H5 — derived tables)', () => {
  it('labels a derived table without rendering "undefined"', () => {
    const sql = 'SELECT a FROM (SELECT id AS a FROM users) AS x'
    const fromStep = flow(sql).find((s) => s.clause === 'FROM')!
    expect(fromStep.description).not.toContain('undefined')
    expect(fromStep.tables?.some((t) => t.includes('undefined'))).toBe(false)
  })

  it('labels a CTE referenced in FROM', () => {
    const sql = 'WITH cte AS (SELECT id FROM users) SELECT a FROM cte'
    const fromStep = flow(sql).find((s) => s.clause === 'FROM')!
    expect(fromStep.description).not.toContain('undefined')
  })

  it('renders normal table names as before', () => {
    const fromStep = flow('SELECT a FROM users JOIN orders ON users.id = orders.user_id').find(
      (s) => s.clause === 'FROM',
    )!
    expect(fromStep.description).toContain('users')
    expect(fromStep.description).toContain('orders')
  })
})

describe('buildExecutionFlow (smoke)', () => {
  it('returns steps in logical order', () => {
    const orders = flow('SELECT a FROM t WHERE x=1 GROUP BY a HAVING a>0 ORDER BY a LIMIT 5').map(
      (s) => s.clause,
    )
    const fromIdx = orders.indexOf('FROM')
    const whereIdx = orders.indexOf('WHERE')
    const groupIdx = orders.indexOf('GROUP BY')
    const selectIdx = orders.indexOf('SELECT')
    const orderIdx = orders.indexOf('ORDER BY')
    const limitIdx = orders.indexOf('LIMIT')
    expect(fromIdx).toBeLessThan(whereIdx)
    expect(whereIdx).toBeLessThan(groupIdx)
    expect(groupIdx).toBeLessThan(selectIdx)
    expect(selectIdx).toBeLessThan(orderIdx)
    expect(orderIdx).toBeLessThan(limitIdx)
  })

  it('returns empty for unparseable input', () => {
    expect(descriptions('SELECT FROM')).toEqual([])
  })
})

describe('buildExecutionFlow (dialect-aware aggregate detection)', () => {
  it('collects standard aggregates regardless of dialect', () => {
    const selectStep = flowDialect('SELECT id, COUNT(*) FROM t GROUP BY id', 'mysql').find(
      (s) => s.clause === 'SELECT',
    )!
    expect(selectStep.aggregates).toContain('COUNT(*)')
  })

  it('collects STRING_AGG on PostgreSQL even when parsed as a plain function', () => {
    const selectStep = flowDialect("SELECT id, STRING_AGG(name, ',') FROM t GROUP BY id", 'postgresql').find(
      (s) => s.clause === 'SELECT',
    )!
    const aggs = selectStep.aggregates ?? []
    expect(aggs.some((a) => a.toUpperCase().startsWith('STRING_AGG'))).toBe(true)
  })

  it('collects DuckDB LIST/PRODUCT aggregates via the DuckDB dialect', () => {
    const selectStep = flowDialect('SELECT LIST(val) FROM t', 'duckdb').find((s) => s.clause === 'SELECT')!
    const aggs = selectStep.aggregates ?? []
    expect(aggs.some((a) => a.toUpperCase().startsWith('LIST'))).toBe(true)
  })
})

describe('buildExecutionFlow (per-CTE flows)', () => {
  it('emits a FROM and SELECT step for each CTE before the main query', () => {
    const sql = [
      'WITH cte_a AS (SELECT id FROM users WHERE active = 1),',
      '     cte_b AS (SELECT id FROM cte_a)',
      'SELECT id FROM cte_b',
    ].join(' ')
    const steps = flow(sql)
    const clauses = steps.map((s) => s.clause)
    const aFrom = clauses.indexOf('FROM')
    const aWhere = clauses.indexOf('WHERE')
    const aSelect = clauses.indexOf('SELECT')
    expect(aFrom).toBeGreaterThanOrEqual(0)
    expect(aWhere).toBeGreaterThan(aFrom)
    expect(aSelect).toBeGreaterThan(aWhere)
    const fromCount = steps.filter((s) => s.clause === 'FROM').length
    expect(fromCount).toBe(3)
  })

  it('tags CTE steps with their cte name and leaves main-query steps untagged', () => {
    const sql = 'WITH cte_a AS (SELECT id FROM users) SELECT id FROM cte_a'
    const steps = flow(sql)
    const cteSteps = steps.filter((s) => s.cte === 'cte_a')
    const mainSteps = steps.filter((s) => s.cte === undefined)
    expect(cteSteps.length).toBeGreaterThan(0)
    expect(mainSteps.length).toBeGreaterThan(0)
    expect(steps.every((s) => s.cte !== null)).toBe(true)
  })

  it('remaps CTE body offsets back to original SQL space', () => {
    const sql = 'WITH cte_a AS (SELECT id FROM users) SELECT id FROM cte_a'
    const steps = flow(sql)
    const cteFrom = steps.find((s) => s.cte === 'cte_a' && s.clause === 'FROM')!
    expect(sql.slice(cteFrom.startOffset, cteFrom.endOffset)).toBe(cteFrom.snippet)
    expect(cteFrom.snippet).toContain('users')
  })

  it('produces unique step ids across all scopes', () => {
    const sql = [
      'WITH cte_a AS (SELECT id FROM users),',
      '     cte_b AS (SELECT id FROM cte_a)',
      'SELECT id FROM cte_b',
    ].join(' ')
    const steps = flow(sql)
    const ids = steps.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('skips recursive / set-op CTEs without throwing', () => {
    const sql = 'WITH RECURSIVE t(n) AS (SELECT 1 AS n UNION ALL SELECT n+1 FROM t WHERE n<5) SELECT n FROM t'
    const steps = flow(sql)
    expect(steps.some((s) => s.cte === undefined && s.clause === 'FROM')).toBe(true)
    expect(steps.some((s) => s.cte === 't')).toBe(false)
  })

  it('still works for a query with no CTEs', () => {
    const steps = flow('SELECT a FROM t WHERE x=1')
    expect(steps.some((s) => s.clause === 'FROM')).toBe(true)
    expect(steps.every((s) => s.cte === undefined)).toBe(true)
  })
})

describe('buildSelectFlow (extracted helper)', () => {
  it('produces the same main-query steps as buildExecutionFlow for a no-CTE query', () => {
    const sql = 'SELECT a FROM t WHERE x=1 GROUP BY a ORDER BY a LIMIT 5'
    const parse = parseSql(sql, 'postgresql')
    const segments = splitClauses(sql)
    const ast = Array.isArray(parse.ast) ? parse.ast[0] : parse.ast
    const helperSteps = buildSelectFlow(segments, ast, 'postgresql', undefined)
    const flowSteps = buildExecutionFlow(splitClauses(sql), parse, sql)
    expect(helperSteps.map((s) => s.clause)).toEqual(flowSteps.map((s) => s.clause))
    expect(helperSteps.every((s) => s.cte === undefined)).toBe(true)
  })

  it('namespaces step ids by cte when cte is provided', () => {
    const sql = 'SELECT a FROM t WHERE x=1'
    const parse = parseSql(sql, 'postgresql')
    const ast = Array.isArray(parse.ast) ? parse.ast[0] : parse.ast
    const steps = buildSelectFlow(splitClauses(sql), ast, 'postgresql', 'my_cte')
    expect(steps.every((s) => s.id.startsWith('my_cte::'))).toBe(true)
    expect(steps.every((s) => s.cte === 'my_cte')).toBe(true)
  })
})
