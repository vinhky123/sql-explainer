import { describe, it, expect } from 'vitest'
import { parseSql } from './parser'

// Regression guard for https://github.com/... — dbt models that rely on macros
// (in_list, lag_ignore_nulls) and {% set %} variables (event_order) defined in the
// dbt project cannot be compiled client-side. The stripper must emit a parseable
// placeholder (jinja_expr_N) instead of NULL, otherwise `x IN NULL` breaks parsing.
//
// This test strips AND parses a realistic macro-heavy dbt model and asserts it parses,
// so any future stripper regression that emits invalid SQL fails the build.
describe('stripJinja + parseSql — macro-heavy dbt model regression', () => {
  const dbtModel = `
{% set sub_attempt_events = ['sub_start', 'sub_start_extra', 'sub_start_attempt'] %}
{% set event_order = "received_time, IF(event IN " ~ in_list(sub_attempt_events) ~ ", 0, 1), message_id" %}

WITH events AS (
    SELECT a.*
    FROM {{ ref('int_noti_full') }} AS a
    CROSS JOIN {{ ref('watermark') }} AS b
),

attempt_numbered_events AS (
    SELECT
        subscription_id,
        event,
        ROW_NUMBER() OVER (PARTITION BY subscription_id ORDER BY {{ event_order }}) AS rn,
        SUM(IF(event IN {{ in_list(sub_attempt_events) }}, 1, 0)) OVER (
            PARTITION BY subscription_id ORDER BY {{ event_order }}
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS attempt_sub
    FROM events
),

backfilled_events AS (
    SELECT
        *, coalesce(rotate_id_raw,
            {{ lag_ignore_nulls('rotate_id_raw', 'subscription_id, attempt_sub', 'received_time') }},
            {{ lag_ignore_nulls('rotate_id_raw', 'subscription_id, attempt_sub', 'received_time', 'DESC') }}
        ) AS rotate_id
    FROM attempt_numbered_events
)
SELECT * FROM backfilled_events
`

  it('parses after stripping unresolved macros (postgresql)', () => {
    const r = parseSql(dbtModel, 'postgresql')
    expect(r.ok).toBe(true)
    expect(r.error).toBeNull()
  })

  it('parses after stripping unresolved macros (bigquery)', () => {
    const r = parseSql(dbtModel, 'bigquery')
    expect(r.ok).toBe(true)
    expect(r.error).toBeNull()
  })

  it('surfaces the unresolved macros as warnings', () => {
    const r = parseSql(dbtModel, 'postgresql')
    expect(r.jinja.detected).toBe(true)
    expect(r.jinja.warnings.some((w) => w.includes('jinja_expr'))).toBe(true)
  })

  it('resolves ref() to identifiers so FROM stays valid', () => {
    const r = parseSql(dbtModel, 'postgresql')
    expect(r.jinja.refs).toContain('int_noti_full')
    expect(r.jinja.refs).toContain('watermark')
  })
})
