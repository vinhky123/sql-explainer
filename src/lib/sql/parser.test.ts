import { describe, it, expect } from 'vitest'
import { parseSql } from './parser'

describe('parseSql (harness sanity)', () => {
  it('returns ok:empty array ast for empty input', () => {
    const r = parseSql('', 'postgresql')
    expect(r.ok).toBe(true)
    expect(r.ast).toEqual([])
    expect(r.error).toBeNull()
  })

  it('parses a SELECT into an array AST', () => {
    const r = parseSql('SELECT id FROM users WHERE id = 5', 'postgresql')
    expect(r.ok).toBe(true)
    expect(Array.isArray(r.ast)).toBe(true)
    expect(r.ast[0].type).toBe('select')
  })

  it('reports a syntax error with location', () => {
    const r = parseSql('SELECT FROM', 'postgresql')
    expect(r.ok).toBe(false)
    expect(r.ast).toBeNull()
    expect(r.error?.message).toBeTruthy()
  })

  it('normalizes a single (non-array) statement into an array', () => {
    const r = parseSql('CREATE TABLE t (a INT)', 'postgresql')
    expect(r.ok).toBe(true)
    expect(Array.isArray(r.ast)).toBe(true)
  })
})

describe('parseSql (dbt/Jinja)', () => {
  it('parses a dbt model with config/ref/var and reports jinja metadata', () => {
    const sql = `{{ config(materialized='table') }}
with s as (select * from {{ ref('stg_orders') }})
select * from s where total > {{ var('min_total', 100) }}`
    const r = parseSql(sql, 'postgresql')
    expect(r.ok).toBe(true)
    expect(r.jinja.detected).toBe(true)
    expect(r.jinja.refs).toContain('stg_orders')
    expect(r.jinja.vars).toContain('min_total')
    expect(r.ast[0].type).toBe('select')
  })

  it('parses a dbt model with an {% if %} control block', () => {
    const sql = `select * from {{ ref('t') }}
{% if cond %}where x = 1{% endif %}`
    const r = parseSql(sql, 'postgresql')
    expect(r.ok).toBe(true)
    expect(r.jinja.detected).toBe(true)
    expect(r.jinja.warnings.length).toBeGreaterThan(0)
  })

  it('still reports syntax errors in the compiled SQL (without misleading line:col)', () => {
    const r = parseSql('select from {{ ref("t") }}', 'postgresql')
    expect(r.ok).toBe(false)
    expect(r.error?.message).toBeTruthy()
    expect(r.error?.line).toBeUndefined()
    expect(r.jinja.detected).toBe(true)
  })
})

describe('parseSql (dialect names + DuckDB)', () => {
  it('parses T-SQL via the corrected TransactSQL name (regression)', () => {
    const r = parseSql('SELECT id FROM users WHERE id = 5', 'tsql')
    expect(r.ok).toBe(true)
    expect(r.parserDialect).toBe('TransactSQL')
    expect(r.dialect).toBe('tsql')
    expect(r.ast[0].type).toBe('select')
  })

  it('parses Redshift via the corrected Redshift name (regression)', () => {
    const r = parseSql('SELECT id FROM users WHERE id = 5', 'redshift')
    expect(r.ok).toBe(true)
    expect(r.parserDialect).toBe('Redshift')
    expect(r.ast[0].type).toBe('select')
  })

  it('parses DuckDB by falling back to PostgreSQL mode', () => {
    const r = parseSql('SELECT id, LISTAGG(name) FROM t GROUP BY id', 'duckdb')
    expect(r.ok).toBe(true)
    expect(r.dialect).toBe('duckdb')
    expect(r.parserDialect).toBe('PostgreSQL')
    expect(r.ast[0].type).toBe('select')
  })

  it('exposes dialect + parserDialect on the result for every engine', () => {
    for (const d of ['mysql', 'mariadb', 'sqlite', 'bigquery', 'snowflake', 'db2', 'flinksql'] as const) {
      const r = parseSql('SELECT 1 AS x', d)
      expect(r.ok).toBe(true)
      expect(r.dialect).toBe(d)
      expect(r.parserDialect).toBeTruthy()
    }
  })
})
