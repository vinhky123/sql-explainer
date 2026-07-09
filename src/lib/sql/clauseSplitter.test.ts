import { describe, it, expect } from 'vitest'
import { splitClauses } from './clauseSplitter'

function keywords(sql: string): string[] {
  return splitClauses(sql).map((s) => s.keyword)
}

describe('splitClauses', () => {
  it('splits a basic SELECT into top-level clauses', () => {
    const kw = keywords('SELECT a FROM t WHERE x = 1 ORDER BY a LIMIT 5')
    expect(kw).toEqual(['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'LIMIT'])
  })

  it('detects UNION ALL as a single keyword (H4)', () => {
    expect(keywords('SELECT 1 UNION ALL SELECT 2')).toContain('UNION ALL')
    expect(keywords('SELECT 1 UNION ALL SELECT 2')).not.toContain('UNION')
  })

  it('detects plain UNION', () => {
    expect(keywords('SELECT 1 UNION SELECT 2')).toContain('UNION')
    expect(keywords('SELECT 1 UNION SELECT 2')).not.toContain('UNION ALL')
  })

  it('detects INTERSECT and EXCEPT', () => {
    expect(keywords('SELECT 1 INTERSECT SELECT 2')).toContain('INTERSECT')
    expect(keywords('SELECT 1 EXCEPT SELECT 2')).toContain('EXCEPT')
  })

  it('does not split keywords inside parentheses', () => {
    const kw = keywords('SELECT a FROM t WHERE x IN (SELECT y FROM u)')
    expect(kw.filter((k) => k === 'SELECT').length).toBe(1)
  })

  it('does not split keywords inside string literals', () => {
    const kw = keywords("SELECT 'FROM WHERE SELECT' AS x FROM t")
    expect(kw).toEqual(['SELECT', 'FROM'])
  })

  it('records correct character offsets', () => {
    const sql = 'SELECT a FROM t'
    const segs = splitClauses(sql)
    const fromSeg = segs.find((s) => s.keyword === 'FROM')!
    expect(sql.slice(fromSeg.startOffset, fromSeg.endOffset)).toBe(fromSeg.text)
  })

  it('skips Jinja tags so they do not corrupt paren depth or keyword detection', () => {
    const sql = "select a from {{ ref('t1') }} where x in (1,2) order by a"
    const kw = splitClauses(sql).map((s) => s.keyword)
    expect(kw).toEqual(['SELECT', 'FROM', 'WHERE', 'ORDER BY'])
  })

  it('keeps offsets in original-space when Jinja is present', () => {
    const sql = "select a from {{ ref('t1') }} where a = 1"
    const segs = splitClauses(sql)
    const where = segs.find((s) => s.keyword === 'WHERE')!
    expect(sql.slice(where.startOffset, where.endOffset)).toBe(where.text)
    expect(sql.slice(where.startOffset, where.startOffset + 5)).toBe('where')
  })
})
