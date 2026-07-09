import { describe, it, expect } from 'vitest'
import { buildExplainUserMessage, SYSTEM_PROMPT } from './prompts'

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

describe('SYSTEM_PROMPT', () => {
  it('is non-empty and sets the persona', () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(50)
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('sql')
  })
})
