import { Parser } from 'node-sql-parser'
import type { Dialect, ParseError } from '@/types'
import { hasJinja, stripJinja } from './jinja'

const parser = new Parser()

const dialectMap: Record<Dialect, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  sqlite: 'SQLite',
  tsql: 'TSQL',
  bigquery: 'BigQuery',
  snowflake: 'Snowflake',
  redshift: 'RedshiftSQL',
  db2: 'DB2',
  flinksql: 'FlinkSQL',
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
}

const NO_JINJA: JinjaMeta = { detected: false, refs: [], vars: [], warnings: [] }

export function parseSql(sql: string, dialect: Dialect): ParseResult {
  if (!sql.trim()) return { ok: true, ast: [], error: null, jinja: NO_JINJA }

  let toParse = sql
  let jinja: JinjaMeta = NO_JINJA
  if (hasJinja(sql)) {
    const r = stripJinja(sql)
    toParse = r.stripped
    jinja = { detected: true, refs: r.refs, vars: r.vars, warnings: r.warnings }
  }

  try {
    const ast = parser.astify(toParse, { database: dialectMap[dialect] })
    return { ok: true, ast: Array.isArray(ast) ? ast : [ast], error: null, jinja }
  } catch (e: any) {
    const err: ParseError = {
      message: e?.message ?? String(e),
      line: jinja.detected ? undefined : e?.location?.start?.line,
      column: jinja.detected ? undefined : e?.location?.start?.column,
    }
    return { ok: false, ast: null, error: err, jinja }
  }
}

export function getParser() {
  return parser
}
