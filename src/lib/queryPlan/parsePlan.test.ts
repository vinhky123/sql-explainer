import { describe, it, expect } from 'vitest'
import { parsePlan } from './parsePlan'

const SAMPLE_JSON = `[
  {
    "Plan": {
      "Node Type": "Limit",
      "Startup Cost": 0,
      "Total Cost": 5,
      "Plan Rows": 10,
      "Plan Width": 4,
      "Plans": [
        {
          "Node Type": "Seq Scan",
          "Relation Name": "orders",
          "Startup Cost": 0,
          "Total Cost": 100,
          "Plan Rows": 1000000,
          "Plan Width": 4,
          "Actual Startup Time": 0.1,
          "Actual Total Time": 300,
          "Actual Rows": 1200000,
          "Actual Loops": 1
        }
      ]
    },
    "Execution Time": 320
  }
]`

describe('parsePlan (M6 — independent IDs across parses)', () => {
  it('produces unique IDs within a single parse', () => {
    const r = parsePlan(SAMPLE_JSON)
    expect(r.ok).toBe(true)
    const ids = [r.root!.id, ...r.root!.children.map((c) => c.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('two consecutive parses do not share the same root id', () => {
    const r1 = parsePlan(SAMPLE_JSON)
    const r2 = parsePlan(SAMPLE_JSON)
    expect(r1.root!.id).toBe(r2.root!.id)
    expect(r1.nodeCount).toBe(r2.nodeCount)
    expect(r1.nodeCount).toBe(2)
  })
})

describe('parsePlan (smoke)', () => {
  it('parses a JSON plan with execution time', () => {
    const r = parsePlan(SAMPLE_JSON)
    expect(r.ok).toBe(true)
    expect(r.format).toBe('json')
    expect(r.executionTime).toBe(320)
    expect(r.root!.nodeType).toBe('Limit')
    expect(r.root!.children[0].nodeType).toBe('Seq Scan')
  })

  it('flags a seq scan on a large table', () => {
    const r = parsePlan(SAMPLE_JSON)
    expect(r.findings.some((f) => f.id.startsWith('seqscan'))).toBe(true)
  })

  it('returns ok:false for empty input', () => {
    expect(parsePlan('').ok).toBe(false)
  })

  it('returns ok:false for non-JSON without cost lines', () => {
    const r = parsePlan('not a plan at all')
    expect(r.ok).toBe(false)
    expect(r.format).toBe('text')
  })
})
