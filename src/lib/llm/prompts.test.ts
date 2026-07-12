import { describe, it, expect } from 'vitest'
import { buildExplainUserMessage, extractCteInfo, SYSTEM_PROMPT } from './prompts'
import { parseSql } from '@/lib/sql/parser'

describe('buildExplainUserMessage (M7 — length cap)', () => {
  it('includes the SQL verbatim when small', () => {
    const msg = buildExplainUserMessage('SELECT 1', 'postgresql', [])
    expect(msg).toContain('SELECT 1')
    expect(msg).not.toContain('truncated')
  })

  it('truncates very long SQL and marks it', () => {
    const huge = 'SELECT ' + 'a, '.repeat(6000) + 'z FROM t'
    const msg = buildExplainUserMessage(huge, 'postgresql', [])
    expect(msg).toContain('truncated')
    expect(msg.length).toBeLessThan(huge.length)
  })

  it('includes heuristic findings when present', () => {
    const msg = buildExplainUserMessage('SELECT * FROM t', 'postgresql', [
      { id: 'select-star', severity: 'warning', title: 'SELECT *', explanation: '', suggestion: 'list columns' },
    ])
    expect(msg).toContain('SELECT *')
    expect(msg).toContain('list columns')
  })
})

describe('extractCteInfo', () => {
  it('returns CTE names and SQL from AST', () => {
    const parseResult = parseSql('WITH cte1 AS (SELECT id FROM users), cte2 AS (SELECT name FROM admins) SELECT * FROM cte1 JOIN cte2 ON cte1.id = cte2.id', 'postgresql')
    const ctes = extractCteInfo(parseResult.ast, parseResult.parserDialect)
    expect(ctes).toHaveLength(2)
    expect(ctes[0].name).toBe('cte1')
    expect(ctes[0].sql).toContain('users')
    expect(ctes[1].name).toBe('cte2')
    expect(ctes[1].sql).toContain('admins')
  })

  it('returns empty for queries without CTEs', () => {
    const parseResult = parseSql('SELECT * FROM users', 'postgresql')
    expect(extractCteInfo(parseResult.ast, parseResult.parserDialect)).toEqual([])
  })

  it('returns empty for null AST', () => {
    expect(extractCteInfo(null)).toEqual([])
  })
})

describe('buildExplainUserMessage with CTEs', () => {
  it('includes CTE breakdown when AST is provided', () => {
    const parseResult = parseSql('WITH active AS (SELECT id, name FROM users WHERE active = true) SELECT * FROM active', 'postgresql')
    const msg = buildExplainUserMessage('WITH active AS (SELECT id, name FROM users WHERE active = true) SELECT * FROM active', 'postgresql', [], parseResult.ast, parseResult.parserDialect)
    expect(msg).toContain('CTE')
    expect(msg).toContain('`active`')
    expect(msg).toContain('users')
    expect(msg).toContain('Final query')
  })

  it('works without AST (backward compat)', () => {
    const msg = buildExplainUserMessage('SELECT 1', 'postgresql')
    expect(msg).toContain('SELECT 1')
  })
})

describe('SYSTEM_PROMPT', () => {
  it('is non-empty and sets the persona', () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(50)
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('sql')
  })
})
