import { describe, it, expect } from 'vitest'
import { formatSql, minifySql, defaultFormatOptions } from './formatter'

const opts = { ...defaultFormatOptions }

describe('minifySql (C1 — string literal preservation)', () => {
  it('preserves newlines inside single-quoted string literals', () => {
    const sql = `INSERT INTO logs (msg) VALUES ('line1\nline2')`
    const out = minifySql(sql, 'postgresql')
    expect(out).toContain("'line1\nline2'")
    expect(out).not.toContain("'line1 line2'")
  })

  it('preserves SQL-escaped quotes inside string literals', () => {
    const sql = `SELECT 'it''s a test' AS x FROM t`
    const out = minifySql(sql, 'postgresql')
    expect(out).toContain("'it''s a test'")
  })

  it('collapses whitespace/newlines outside of string literals', () => {
    const sql = `SELECT   a,\n\n   b\n  FROM   t`
    const out = minifySql(sql, 'postgresql')
    expect(out).not.toMatch(/\n/)
    expect(out.length).toBeLessThan(sql.length + 5)
  })

  it('does not crash on block comments', () => {
    const sql = `SELECT /* multi\nline */ a FROM t`
    const out = minifySql(sql, 'postgresql')
    expect(out).toContain('SELECT')
    expect(out).toContain('FROM')
  })
})

describe('formatSql', () => {
  it('returns empty for empty/whitespace input', () => {
    expect(formatSql('   ', opts)).toBe('')
  })
  it('formats a simple select', () => {
    const out = formatSql('select a,b from t', opts)
    expect(out.toUpperCase()).toContain('SELECT')
    expect(out).toContain('FROM')
  })
})
