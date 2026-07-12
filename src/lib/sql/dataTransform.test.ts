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

  describe('behavioral: CTE steps actually transform data', () => {
    const sql = 'WITH cte_a AS (SELECT id, status FROM users WHERE status = 1) SELECT id FROM cte_a'

    function cteStepIdx(cte: string, clause: string): number {
      const parse = parseSql(sql, 'postgresql')
      const steps = buildExecutionFlow(splitClauses(sql), parse, sql)
      const idx = steps.findIndex((s) => s.cte === cte && s.clause === clause)
      expect(idx).toBeGreaterThanOrEqual(0)
      return idx
    }

    function aliveRows(snap: NonNullable<ReturnType<typeof snaps>>['snapshots'][number]): number {
      expect(snap).not.toBeNull()
      return snap!.rows.filter((r) => !r.dimmed).length
    }

    function aliveCols(snap: NonNullable<ReturnType<typeof snaps>>['snapshots'][number]): number {
      expect(snap).not.toBeNull()
      return snap!.columns.filter((c) => !c.dimmed).length
    }

    it('WHERE narrows rows within a CTE', () => {
      const r = snaps(sql)
      expect(r).not.toBeNull()
      const fromIdx = cteStepIdx('cte_a', 'FROM')
      const whereIdx = cteStepIdx('cte_a', 'WHERE')
      const fromAlive = aliveRows(r!.snapshots[fromIdx])
      const whereAlive = aliveRows(r!.snapshots[whereIdx])
      expect(whereAlive).toBeLessThan(fromAlive)
    })

    it('SELECT projects columns within a CTE', () => {
      const r = snaps(sql)
      expect(r).not.toBeNull()
      const fromIdx = cteStepIdx('cte_a', 'FROM')
      const selectIdx = cteStepIdx('cte_a', 'SELECT')
      const fromCols = aliveCols(r!.snapshots[fromIdx])
      const selectCols = aliveCols(r!.snapshots[selectIdx])
      expect(selectCols).toBeLessThan(fromCols)
      expect(selectCols).toBe(2)
    })

    it('WHERE actually highlights the referenced status column', () => {
      const r = snaps(sql)
      expect(r).not.toBeNull()
      const whereIdx = cteStepIdx('cte_a', 'WHERE')
      const snap = r!.snapshots[whereIdx]
      expect(snap).not.toBeNull()
      const highlighted = snap!.columns.filter((c) => c.highlighted).map((c) => c.label)
      expect(highlighted).toContain('status')
    })
  })

  it('CTE-of-CTE FROM snapshot derives rows from referenced CTE output', () => {
    const sql = [
      'WITH cte_a AS (SELECT id FROM users WHERE id > 0),',
      'cte_b AS (SELECT id FROM cte_a)',
      'SELECT id FROM cte_b',
    ].join(' ')
    const r = snaps(sql)
    expect(r).not.toBeNull()
    const parse = parseSql(sql, 'postgresql')
    const steps = buildExecutionFlow(splitClauses(sql), parse, sql)
    const aFinalIdx = steps.map((s, i) => ({ s, i })).filter(({ s }) => s.cte === 'cte_a').slice(-1)[0].i
    const bFromIdx = steps.findIndex((s) => s.cte === 'cte_b' && s.clause === 'FROM')
    expect(bFromIdx).toBeGreaterThanOrEqual(0)
    const aFinal = r!.snapshots[aFinalIdx]
    const bFrom = r!.snapshots[bFromIdx]
    expect(aFinal).not.toBeNull()
    expect(bFrom).not.toBeNull()
    const aAlive = aFinal!.rows.filter((row) => !row.dimmed).length
    const bAlive = bFrom!.rows.filter((row) => !row.dimmed).length
    expect(bAlive).toBe(aAlive)
  })
})
