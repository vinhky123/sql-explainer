import { describe, it, expect } from 'vitest'
import {
  hasJinja,
  stripJinja,
  remapToOriginal,
  remapToStripped,
  formatAroundJinja,
} from './jinja'

describe('hasJinja', () => {
  it('detects expr / stmt / comment tags', () => {
    expect(hasJinja('{{ x }}')).toBe(true)
    expect(hasJinja('{% if a %}')).toBe(true)
    expect(hasJinja('{# note #}')).toBe(true)
    expect(hasJinja('SELECT 1')).toBe(false)
  })

  it('is a substring gate (string-context safety lives in stripJinja)', () => {
    expect(hasJinja("'{{ looks like a tag but is a SQL string'")).toBe(true)
  })
})

describe('stripJinja — expression resolution', () => {
  it('resolves ref() to a table identifier', () => {
    const r = stripJinja('SELECT * FROM {{ ref("stg_orders") }}')
    expect(r.stripped).toBe('SELECT * FROM stg_orders')
    expect(r.refs).toEqual(['stg_orders'])
    expect(r.vars).toEqual([])
  })

  it('resolves ref(package, model) to the model name', () => {
    const r = stripJinja('{{ ref("metrics", "mrr") }}')
    expect(r.stripped).toBe('mrr')
    expect(r.refs).toEqual(['mrr'])
  })

  it('resolves source(schema, table) to the table name', () => {
    const r = stripJinja('{{ source("raw", "events") }}')
    expect(r.stripped).toBe('events')
    expect(r.refs).toEqual(['events'])
  })

  it('resolves var() with default to the default literal', () => {
    const r = stripJinja('{{ var("revenue_threshold", 100) }}')
    expect(r.stripped).toBe('100')
    expect(r.vars).toEqual(['revenue_threshold'])
  })

  it('resolves var() without default to NULL', () => {
    const r = stripJinja('{{ var("start_date") }}')
    expect(r.stripped).toBe('NULL')
    expect(r.vars).toEqual(['start_date'])
  })

  it('resolves var() with a string default to a SQL string literal', () => {
    const r = stripJinja("{{ var('d', '2024-01-01') }}")
    expect(r.stripped).toBe("'2024-01-01'")
  })

  it('falls back to NULL for unknown expressions and warns', () => {
    const r = stripJinja('{{ safe_divide("revenue", "sessions") }}')
    expect(r.stripped).toBe('NULL')
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('resolves bare literals (number / true / null)', () => {
    expect(stripJinja('{{ 42 }}').stripped).toBe('42')
    expect(stripJinja('{{ true }}').stripped).toBe('true')
    expect(stripJinja('{{ none }}').stripped).toBe('NULL')
  })

  it('config() yields no SQL token', () => {
    const r = stripJinja("{{ config(materialized='table') }}\nSELECT 1")
    expect(r.stripped).toBe('\nSELECT 1')
  })
})

describe('stripJinja — statement / comment removal', () => {
  it('removes {# comments #}', () => {
    expect(stripJinja('SELECT 1 {# hi #} FROM t').stripped).toBe('SELECT 1  FROM t')
  })

  it('removes a single {% set %} statement', () => {
    expect(stripJinja("{% set x = 5 %}\nSELECT 1").stripped).toBe('\nSELECT 1')
  })

  it('drops an entire {% if %}...{% endif %} block (body included)', () => {
    const sql = 'SELECT 1 {% if cond %}WHERE x = 1{% endif %} FROM t'
    const r = stripJinja(sql)
    expect(r.stripped).toBe('SELECT 1  FROM t')
    expect(r.warnings.some((w) => w.includes('if'))).toBe(true)
  })

  it('handles nested {% if %} blocks', () => {
    const sql = '{% if a %}x{% if b %}y{% endif %}z{% endif %}SELECT 1'
    expect(stripJinja(sql).stripped).toBe('SELECT 1')
  })

  it('drops a {% for %} loop entirely', () => {
    const sql = '{% for c in cols %}col{% endfor %}SELECT 1'
    expect(stripJinja(sql).stripped).toBe('SELECT 1')
  })
})

describe('stripJinja — does not touch Jinja inside SQL strings', () => {
  it('keeps {{ }} inside a SQL string literal verbatim', () => {
    const sql = "WHERE ds >= '{{ var(\"start_date\", \"2024-01-01\") }}'"
    const r = stripJinja(sql)
    expect(r.stripped).toBe(sql)
    expect(r.refs).toEqual([])
  })
})

describe('offset remap round-trips', () => {
  it('stripped offsets map back into original space', () => {
    const sql = 'SELECT * FROM {{ ref("t") }} WHERE id = 1'
    const r = stripJinja(sql)
    const tPos = r.stripped.indexOf('t')
    expect(remapToOriginal(r, tPos)).toBe(sql.indexOf('{{'))
    const wherePos = r.stripped.indexOf('WHERE')
    expect(remapToOriginal(r, wherePos)).toBe(sql.indexOf('WHERE'))
  })

  it('remapToStripped∘remapToOriginal is stable on original-space anchors', () => {
    const sql = 'SELECT {{ ref("a") }} FROM b'
    const r = stripJinja(sql)
    const fromB = sql.indexOf('FROM')
    const back = remapToStripped(r, remapToOriginal(r, r.stripped.indexOf('FROM')))
    expect(back).toBe(r.stripped.indexOf('FROM'))
    expect(fromB).toBeGreaterThan(-1)
  })

  it('plain SQL (no jinja) has identity maps', () => {
    const r = stripJinja('SELECT 1 FROM t')
    for (let k = 0; k <= r.stripped.length; k++) {
      expect(remapToOriginal(r, k)).toBe(k)
    }
  })
})

describe('formatAroundJinja', () => {
  const fmt = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase()

  it('reinserts an inline {{ ref() }} at the placeholder position', () => {
    const out = formatAroundJinja('select * from {{ ref("t") }}', fmt)
    expect(out).toContain('{{ ref("t") }}')
    expect(out.toUpperCase()).toContain('SELECT * FROM')
  })

  it('puts block {% set %} / {# #} on their own line', () => {
    const out = formatAroundJinja('{% set x = 1 %}\nselect 1', fmt)
    expect(out).toContain('{% set x = 1 %}')
    expect(out).toContain('SELECT 1')
  })

  it('drops the whole {% if %} block and formats the rest', () => {
    const out = formatAroundJinja('{% if a %}where x=1{% endif %}select 1 from t', fmt)
    expect(out).not.toContain('where x=1')
    expect(out.toUpperCase()).toContain('SELECT 1 FROM T')
  })
})
