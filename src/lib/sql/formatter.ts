import { format as sqlFormat } from 'sql-formatter'
import type { Dialect } from '@/types'
import { formatAroundJinja, findTagClose, hasJinja } from './jinja'

const dialectMap: Record<Dialect, string> = {
  postgresql: 'postgresql',
  mysql: 'mysql',
  mariadb: 'mariadb',
  sqlite: 'sqlite',
  tsql: 'transactsql',
  bigquery: 'bigquery',
  snowflake: 'snowflake',
  redshift: 'redshift',
  db2: 'db2',
  flinksql: 'sql',
  duckdb: 'duckdb',
}

export type IndentStyle = 'standard' | 'tabularLeft' | 'tabularRight'
export type KeywordCase = 'preserve' | 'upper' | 'lower'
export type LogicalOperatorNewline = 'before' | 'after'

export interface FormatOptions {
  dialect: Dialect
  tabWidth: number
  useTabs: boolean
  keywordCase: KeywordCase
  linesBetweenQueries: number
  dense: boolean
  indentStyle: IndentStyle
  expressionWidth: number
  logicalOperatorNewline: LogicalOperatorNewline
}

export const defaultFormatOptions: FormatOptions = {
  dialect: 'postgresql',
  tabWidth: 2,
  useTabs: false,
  keywordCase: 'upper',
  linesBetweenQueries: 2,
  dense: false,
  indentStyle: 'standard',
  expressionWidth: 80,
  logicalOperatorNewline: 'before',
}

export function formatSql(sql: string, opts: FormatOptions): string {
  if (!sql.trim()) return ''
  try {
    const run = (s: string) =>
      sqlFormat(s, {
        language: dialectMap[opts.dialect] as any,
        tabWidth: opts.tabWidth,
        useTabs: opts.useTabs,
        keywordCase: opts.keywordCase,
        indentStyle: opts.indentStyle,
        logicalOperatorNewline: opts.logicalOperatorNewline,
        expressionWidth: opts.expressionWidth,
        linesBetweenQueries: opts.linesBetweenQueries,
        denseOperators: opts.dense,
      })
    return hasJinja(sql) ? formatAroundJinja(sql, run) : run(sql)
  } catch {
    return sql
  }
}

export function minifySql(sql: string, dialect: Dialect): string {
  if (!sql.trim()) return ''
  try {
    const run = (s: string) =>
      sqlFormat(s, {
        language: dialectMap[dialect] as any,
        tabWidth: 0,
        useTabs: false,
        keywordCase: 'upper',
        indentStyle: 'standard',
        logicalOperatorNewline: 'after',
        expressionWidth: 0,
        linesBetweenQueries: 0,
        denseOperators: true,
      })
    const minified = hasJinja(sql) ? formatAroundJinja(sql, run, { compact: true }) : run(sql)
    return collapseForMinify(minified)
  } catch {
    return collapseForMinify(sql)
  }
}

function collapseForMinify(sql: string): string {
  let out = ''
  let inSingle = false
  let inDouble = false
  let pendingSpace = false
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    const next = sql[i + 1] ?? ''
    if (inSingle) {
      out += ch
      if (ch === "'") {
        if (next === "'") {
          out += next
          i += 2
          continue
        }
        inSingle = false
      }
      i += 1
      continue
    }
    if (inDouble) {
      out += ch
      if (ch === '"') inDouble = false
      i += 1
      continue
    }
    if (ch === "'") {
      if (pendingSpace) {
        out += ' '
        pendingSpace = false
      }
      out += ch
      inSingle = true
      i += 1
      continue
    }
    if (ch === '"') {
      if (pendingSpace) {
        out += ' '
        pendingSpace = false
      }
      out += ch
      inDouble = true
      i += 1
      continue
    }
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === '\f' || ch === '\v') {
      pendingSpace = true
      i += 1
      continue
    }
    if (ch === '{' && (sql[i + 1] === '{' || sql[i + 1] === '%' || sql[i + 1] === '#')) {
      const close = sql[i + 1] === '{' ? '}}' : sql[i + 1] === '%' ? '%}' : '#}'
      const end = findTagClose(sql, i + 2, close)
      const stop = end < 0 ? sql.length : end + 2
      if (pendingSpace) {
        out += ' '
        pendingSpace = false
      }
      out += sql.slice(i, stop)
      i = stop
      continue
    }
    if (pendingSpace) {
      out += ' '
      pendingSpace = false
    }
    out += ch
    i += 1
  }
  return out.trim()
}
