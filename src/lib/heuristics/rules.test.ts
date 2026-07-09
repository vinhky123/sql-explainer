import { describe, it, expect } from 'vitest'
import { runHeuristics } from './rules'
import { parseSql } from '@/lib/sql/parser'

function findings(sql: string) {
  const parse = parseSql(sql, 'postgresql')
  return runHeuristics(sql, parse.ast)
}

function hasRule(sql: string, baseId: string): boolean {
  return findings(sql).some((f) => f.id === baseId || f.id.startsWith(baseId + '-'))
}

describe('runHeuristics (H2 — count-star false positive)', () => {
  it('does NOT flag a legitimate grouped aggregate', () => {
    const sql = 'SELECT department, COUNT(*) FROM employees GROUP BY department'
    expect(hasRule(sql, 'count-star-exists')).toBe(false)
  })

  it('does NOT flag a bare total-row count with no WHERE', () => {
    expect(hasRule('SELECT COUNT(*) FROM users', 'count-star-exists')).toBe(false)
  })

  it('flags the existence-check pattern (SELECT COUNT(*) FROM t WHERE ...)', () => {
    expect(hasRule('SELECT COUNT(*) FROM users WHERE active = 1', 'count-star-exists')).toBe(true)
  })
})

describe('runHeuristics (H1 — per-occurrence highlighting)', () => {
  it('highlights each comma separately in a comma-join cartesian', () => {
    const sql = 'SELECT * FROM a, b, c'
    const f = findings(sql).filter((x) => x.id.startsWith('cartesian-join'))
    expect(f.length).toBe(2)
    const offsets = f.map((x) => x.startOffset ?? 0).sort((a, b) => a - b)
    // two DISTINCT comma offsets, ascending, matching the real commas
    const commas = [...sql.matchAll(/,/g)].map((m) => m.index!)
    expect(offsets).toEqual(commas)
    expect(new Set(offsets).size).toBe(2)
  })

  it('highlights each JOIN separately in chained joins without ON', () => {
    const sql = 'SELECT * FROM a JOIN b JOIN c JOIN d'
    const f = findings(sql).filter((x) => x.id.startsWith('cartesian-join'))
    expect(f.length).toBe(3)
    expect(new Set(f.map((x) => x.startOffset)).size).toBe(3)
  })

  it('highlights each NOT IN (subquery) separately', () => {
    const sql = 'SELECT * FROM t WHERE x NOT IN (SELECT y FROM u) AND z NOT IN (SELECT w FROM v)'
    const f = findings(sql).filter((x) => x.id.startsWith('not-in-subquery'))
    expect(f.length).toBe(2)
    expect(new Set(f.map((x) => x.startOffset)).size).toBe(2)
  })
})

describe('runHeuristics (H3 — regex safety)', () => {
  it('does not crash on a column with regex metacharacters', () => {
    const sql = `SELECT a FROM t WHERE DATE("weird+name") = '2024-01-01'`
    expect(() => findings(sql)).not.toThrow()
  })

  it('does not crash / false-fire on empty column names', () => {
    expect(() => findings('SELECT a FROM t WHERE COALESCE(a) = 1')).not.toThrow()
  })
})

describe('runHeuristics (M1 — set-op branch analysis)', () => {
  it('analyzes the second branch of a UNION', () => {
    const sql = 'SELECT a FROM x UNION SELECT * FROM y'
    expect(hasRule(sql, 'select-star')).toBe(true)
  })

  it('analyzes a leading-wildcard LIKE in a UNION second branch', () => {
    const sql = `SELECT a FROM x UNION SELECT b FROM y WHERE name LIKE '%z%'`
    expect(hasRule(sql, 'like-leading-wildcard')).toBe(true)
  })
})

describe('runHeuristics (smoke / no false positives)', () => {
  it('clean indexed query yields no findings', () => {
    expect(findings('SELECT id, name FROM users WHERE id = 5')).toEqual([])
  })

  it('non-SELECT yields no findings', () => {
    expect(findings('CREATE TABLE t (a INT)')).toEqual([])
  })

  it('empty yields no findings', () => {
    expect(findings('')).toEqual([])
  })

  it('still flags SELECT *', () => {
    expect(hasRule('SELECT * FROM users', 'select-star')).toBe(true)
  })

  it('still flags a leading-wildcard LIKE', () => {
    expect(hasRule(`SELECT a FROM t WHERE name LIKE '%son'`, 'like-leading-wildcard')).toBe(true)
  })
})

describe('runHeuristics (dbt/Jinja)', () => {
  it('analyzes a dbt model and remaps finding offsets into original templated text', () => {
    const sql = `select * from {{ ref('stg_orders') }} o where o.name like '%son'`
    const parse = parseSql(sql, 'postgresql')
    const f = runHeuristics(sql, parse.ast)
    const star = f.find((x) => x.id === 'select-star')
    expect(star).toBeTruthy()
    expect(sql.slice(star!.startOffset!, star!.endOffset!)).toMatch(/select\s+\*/i)
    const like = f.find((x) => x.id.startsWith('like-leading-wildcard'))
    expect(like).toBeTruthy()
    expect(sql.slice(like!.startOffset!, like!.endOffset!)).toContain("'%son'")
  })

  it('compiles cleanly on a dbt model with no issues (no false positives from tags)', () => {
    const sql = `select id from {{ ref('users') }} where id = 5`
    const parse = parseSql(sql, 'postgresql')
    expect(runHeuristics(sql, parse.ast)).toEqual([])
  })
})
