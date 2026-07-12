import { describe, it, expect } from 'vitest'
import { splitClauses } from './clauseSplitter'
import { buildExecutionFlow, buildSelectFlow } from './executionOrder'
import { parseSql } from './parser'

function flow(sql: string) {
  const parse = parseSql(sql, 'postgresql')
  return buildExecutionFlow(splitClauses(sql), parse)
}

function flowDialect(sql: string, dialect: Parameters<typeof parseSql>[1]) {
  const parse = parseSql(sql, dialect)
  return buildExecutionFlow(splitClauses(sql), parse)
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

describe('buildSelectFlow (extracted helper)', () => {
  it('produces the same main-query steps as buildExecutionFlow for a no-CTE query', () => {
    const sql = 'SELECT a FROM t WHERE x=1 GROUP BY a ORDER BY a LIMIT 5'
    const parse = parseSql(sql, 'postgresql')
    const segments = splitClauses(sql)
    const ast = Array.isArray(parse.ast) ? parse.ast[0] : parse.ast
    const helperSteps = buildSelectFlow(segments, ast, 'postgresql', undefined)
    const flowSteps = buildExecutionFlow(splitClauses(sql), parse)
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
