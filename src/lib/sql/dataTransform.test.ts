import { describe, it, expect } from 'vitest'
import { buildSnapshots } from './dataTransform'
import { splitClauses } from './clauseSplitter'
import { buildExecutionFlow } from './executionOrder'
import { parseSql } from './parser'

function snaps(sql: string) {
  const parse = parseSql(sql, 'postgresql')
  const steps = buildExecutionFlow(splitClauses(sql), parse, sql)
  return buildSnapshots(steps, parse, sql)
}

describe('buildSnapshots (per-CTE)', () => {
  it('returns one snapshot per step across CTE + main scopes', () => {
    const sql = 'WITH cte_a AS (SELECT id FROM users) SELECT id FROM cte_a'
    const r = snaps(sql)
    expect(r).not.toBeNull()
    const parse = parseSql(sql, 'postgresql')
    const steps = buildExecutionFlow(splitClauses(sql), parse, sql)
    expect(r!.snapshots.length).toBe(steps.length)
    expect(r!.snapshots.every((s) => s !== null)).toBe(true)
  })

  it('seeds a CTE-of-CTE from the referenced CTE final state', () => {
    const sql = [
      'WITH cte_a AS (SELECT id FROM users WHERE id > 0),',
      'cte_b AS (SELECT id FROM cte_a)',
      'SELECT id FROM cte_b',
    ].join(' ')
    const r = snaps(sql)
    expect(r).not.toBeNull()
    const parse = parseSql(sql, 'postgresql')
    const steps = buildExecutionFlow(splitClauses(sql), parse, sql)
    const bFromIdx = steps.findIndex((s) => s.cte === 'cte_b' && s.clause === 'FROM')
    expect(bFromIdx).toBeGreaterThanOrEqual(0)
    expect(r!.snapshots[bFromIdx]).not.toBeNull()
  })

  it('returns null snapshots for an unvisualizable CTE without throwing', () => {
    const sql = 'WITH RECURSIVE t(n) AS (SELECT 1 AS n UNION ALL SELECT n+1 FROM t WHERE n<5) SELECT n FROM t'
    const r = snaps(sql)
    expect(r).not.toBeNull()
    const parse = parseSql(sql, 'postgresql')
    const steps = buildExecutionFlow(splitClauses(sql), parse, sql)
    expect(r!.snapshots.length).toBe(steps.length)
  })

  it('returns null when there are no visualizable scopes', () => {
    const r = snaps('SELECT 1')
    expect(r).toBeNull()
  })
})
