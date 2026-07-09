import { Parser } from 'node-sql-parser'
import type { Dialect, ParseError } from '@/types'
import { hasJinja, stripJinja } from './jinja'

const parser = new Parser()

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
  if (hasJinja(sql)) {
    const r = stripJinja(sql)
    toParse = r.stripped
    jinja = { detected: true, refs: r.refs, vars: r.vars, warnings: r.warnings }
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
    const line = jinja.detected ? undefined : e?.location?.start?.line
    const column = jinja.detected ? undefined : e?.location?.start?.column
    const rawMsg = e?.message ?? String(e)
    const message = line ? `Line ${line}, col ${column ?? '?'}: ${rawMsg}` : rawMsg
    const err: ParseError = { message, line, column }
    return { ok: false, ast: null, error: err, jinja, dialect, parserDialect }
  }
}

export function getParser() {
  return parser
}
