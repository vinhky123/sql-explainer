import { describe, it, expect } from 'vitest'
import { parseSql } from './parser'
import { runHeuristics } from '@/lib/heuristics/rules'
import { formatSql, minifySql, defaultFormatOptions } from './formatter'
import { splitClauses } from './clauseSplitter'

const DBT_SAMPLE = `{{ config(materialized='table') }}

{% if is_incremental() %}
  where event_date >= '{{ var("start_date", "2024-01-01") }}'
{% endif %}

with source as (
    select * from {{ ref('stg_events') }}
),
enriched as (
    select
        user_id,
        event_type,
        {{ safe_divide('revenue', 'sessions') }} as revenue_per_session
    from source
)
select user_id, sum(revenue_per_session) as lifetime_revenue
from enriched
group by user_id
having sum(revenue_per_session) > {{ var('revenue_threshold', 100) }}
order by lifetime_revenue desc`

describe('dbt sample e2e', () => {
  it('parses, reports refs/vars, optimizes, formats, splits clauses', () => {
    const parse = parseSql(DBT_SAMPLE, 'postgresql')
    expect(parse.ok).toBe(true)
    expect(parse.jinja.detected).toBe(true)
    expect(parse.jinja.refs).toContain('stg_events')
    expect(parse.jinja.vars).toContain('revenue_threshold')

    const findings = runHeuristics(DBT_SAMPLE, parse.ast)
    findings.forEach((f) => {
      if (f.startOffset != null && f.endOffset != null) {
        const snippet = DBT_SAMPLE.slice(f.startOffset, f.endOffset)
        expect(snippet.length).toBeGreaterThan(0)
      }
    })

    const fmt = formatSql(DBT_SAMPLE, { ...defaultFormatOptions, dialect: 'postgresql' })
    expect(fmt).toContain('{{ ref(\'stg_events\') }}')
    expect(fmt).toContain('{{ safe_divide')
    expect(fmt).not.toContain('is_incremental')
    expect(fmt.toUpperCase()).toContain('SELECT')

    const mini = minifySql(DBT_SAMPLE, 'postgresql')
    expect(mini).toContain("{{ var('revenue_threshold', 100) }}")

    const segs = splitClauses(DBT_SAMPLE)
    segs.forEach((s) => {
      expect(DBT_SAMPLE.slice(s.startOffset, s.endOffset).trim()).toBe(s.text)
    })
  })
})
