import { findTagClose } from './jinja'

export interface ClauseSegment {
  keyword: string
  text: string
  startOffset: number
  endOffset: number
}

function skipJinja(sql: string, i: number): number {
  const nx = sql[i + 1] ?? ''
  if (sql[i] !== '{' || (nx !== '{' && nx !== '%' && nx !== '#')) return -1
  const close = nx === '{' ? '}}' : nx === '%' ? '%}' : '#}'
  const end = findTagClose(sql, i + 2, close)
  return end < 0 ? sql.length : end + 2
}

interface PendingKeyword {
  keyword: string
  full: string
}

const CLAUSE_KEYWORDS: PendingKeyword[] = [
  { keyword: 'WITH', full: 'WITH' },
  { keyword: 'SELECT', full: 'SELECT' },
  { keyword: 'FROM', full: 'FROM' },
  { keyword: 'WHERE', full: 'WHERE' },
  { keyword: 'GROUP BY', full: 'GROUP BY' },
  { keyword: 'HAVING', full: 'HAVING' },
  { keyword: 'ORDER BY', full: 'ORDER BY' },
  { keyword: 'LIMIT', full: 'LIMIT' },
  { keyword: 'OFFSET', full: 'OFFSET' },
  { keyword: 'UNION ALL', full: 'UNION ALL' },
  { keyword: 'UNION', full: 'UNION' },
  { keyword: 'INTERSECT', full: 'INTERSECT' },
  { keyword: 'EXCEPT', full: 'EXCEPT' },
  { keyword: 'WINDOW', full: 'WINDOW' },
]

function isWordBoundary(ch: string): boolean {
  return /[\s,;()]/.test(ch) || ch === ''
}

function matchKeywordAt(sql: string, i: number, depth: number): PendingKeyword | null {
  if (depth !== 0) return null
  const upper = sql.toUpperCase()
  for (const kw of CLAUSE_KEYWORDS) {
    if (upper.startsWith(kw.full, i)) {
      const before = i === 0 ? '' : sql[i - 1]
      const after = sql[i + kw.full.length] ?? ''
      if (isWordBoundary(before) && isWordBoundary(after)) {
        return kw
      }
    }
  }
  return null
}

export function splitClauses(sql: string): ClauseSegment[] {
  const segments: ClauseSegment[] = []
  let depth = 0
  let inSingle = false
  let inDouble = false
  let inLineComment = false
  let inBlockComment = false
  let currentKeyword: string | null = null
  let currentStart = 0

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    const next = sql[i + 1] ?? ''

    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++ }
      continue
    }
    if (inSingle) {
      if (ch === "'") inSingle = false
      continue
    }
    if (inDouble) {
      if (ch === '"') inDouble = false
      continue
    }

    if (ch === '-' && next === '-') { inLineComment = true; i++; continue }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue }
    if (ch === "'") { inSingle = true; continue }
    if (ch === '"') { inDouble = true; continue }
    if (ch === '{' && (next === '{' || next === '%' || next === '#')) {
      i = skipJinja(sql, i) - 1
      continue
    }
    if (ch === '(') { depth++; continue }
    if (ch === ')') { depth--; continue }

    const matched = matchKeywordAt(sql, i, depth)
    if (matched) {
      if (currentKeyword !== null) {
        const text = sql.slice(currentStart, i).trim()
        if (text) {
          segments.push({
            keyword: currentKeyword,
            text,
            startOffset: currentStart,
            endOffset: i,
          })
        }
      }
      currentKeyword = matched.keyword
      currentStart = i
      i += matched.full.length - 1
    }
  }

  if (currentKeyword !== null) {
    const text = sql.slice(currentStart).trim()
    if (text) {
      segments.push({
        keyword: currentKeyword,
        text,
        startOffset: currentStart,
        endOffset: sql.length,
      })
    }
  }

  return segments
}
