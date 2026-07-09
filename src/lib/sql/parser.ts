import { Parser } from 'node-sql-parser'
import type { Dialect, ParseError } from '@/types'
import { hasJinja, stripJinja, remapToOriginal, type StripJinjaResult } from './jinja'

const parser = new Parser()

function offsetToLineCol(sql: string, offset: number): { line: number; column: number } {
  let line = 1
  let column = 1
  const end = Math.min(offset, sql.length)
  for (let i = 0; i < end; i++) {
    if (sql[i] === '\n') {
      line++
      column = 1
    } else {
      column++
    }
  }
  return { line, column }
}

const dialectMap: Record<Dialect, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  sqlite: 'SQLite',
  tsql: 'TransactSQL',
  bigquery: 'BigQuery',
  snowflake: 'Snowflake',
  redshift: 'Redshift',
  db2: 'DB2',
  flinksql: 'FlinkSQL',
  duckdb: 'PostgreSQL',
}

export interface JinjaMeta {
  detected: boolean
  refs: string[]
  vars: string[]
  warnings: string[]
}

export interface ParseResult {
  ok: boolean
  ast: any | null
  error: ParseError | null
  jinja: JinjaMeta
  dialect: Dialect
  parserDialect: string
}

const NO_JINJA: JinjaMeta = { detected: false, refs: [], vars: [], warnings: [] }

export function parseSql(sql: string, dialect: Dialect): ParseResult {
  if (!sql.trim()) return { ok: true, ast: [], error: null, jinja: NO_JINJA, dialect, parserDialect: dialectMap[dialect] }

  let toParse = sql
  let jinja: JinjaMeta = NO_JINJA
  let stripped: StripJinjaResult | null = null
  if (hasJinja(sql)) {
    stripped = stripJinja(sql)
    toParse = stripped.stripped
    jinja = { detected: true, refs: stripped.refs, vars: stripped.vars, warnings: stripped.warnings }
  }

  const parserDialect = dialectMap[dialect]
  try {
    const ast = parser.astify(toParse, { database: parserDialect })
    return { ok: true, ast: Array.isArray(ast) ? ast : [ast], error: null, jinja, dialect, parserDialect }
  } catch (e: any) {
    if (dialect === 'duckdb') {
      try {
        const ast = parser.astify(toParse, { database: 'MySQL' })
        return { ok: true, ast: Array.isArray(ast) ? ast : [ast], error: null, jinja, dialect, parserDialect: 'MySQL' }
      } catch {
        // fall through to original error
      }
    }
    let line = e?.location?.start?.line as number | undefined
    let column = e?.location?.start?.column as number | undefined
    if (stripped) {
      const strippedOffset = e?.location?.start?.offset as number | undefined
      if (typeof strippedOffset === 'number') {
        const lc = offsetToLineCol(sql, remapToOriginal(stripped, strippedOffset))
        line = lc.line
        column = lc.column
      } else {
        line = undefined
        column = undefined
      }
    }
    const rawMsg = e?.message ?? String(e)
    const message = line ? `Line ${line}, col ${column ?? '?'}: ${rawMsg}` : rawMsg
    const err: ParseError = { message, line, column }
    return { ok: false, ast: null, error: err, jinja, dialect, parserDialect }
  }
}

export function getParser() {
  return parser
}
