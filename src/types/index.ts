export type Dialect =
  | 'mysql'
  | 'postgresql'
  | 'mariadb'
  | 'sqlite'
  | 'tsql'
  | 'bigquery'
  | 'snowflake'
  | 'redshift'
  | 'db2'
  | 'flinksql'
  | 'duckdb'

export interface DialectOption {
  value: Dialect
  label: string
  group: string
}

export const DIALECTS: DialectOption[] = [
  { value: 'postgresql', label: 'PostgreSQL', group: 'Popular' },
  { value: 'mysql', label: 'MySQL', group: 'Popular' },
  { value: 'sqlite', label: 'SQLite', group: 'Popular' },
  { value: 'mariadb', label: 'MariaDB', group: 'Popular' },
  { value: 'tsql', label: 'T-SQL (SQL Server)', group: 'Enterprise' },
  { value: 'db2', label: 'DB2', group: 'Enterprise' },
  { value: 'bigquery', label: 'BigQuery', group: 'Analytics' },
  { value: 'snowflake', label: 'Snowflake', group: 'Analytics' },
  { value: 'redshift', label: 'Redshift', group: 'Analytics' },
  { value: 'duckdb', label: 'DuckDB', group: 'Analytics' },
  { value: 'flinksql', label: 'Flink SQL', group: 'Streaming' },
]

export interface ParseError {
  message: string
  line?: number
  column?: number
}

export interface Finding {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  explanation: string
  suggestion: string
  rewrite?: string
  snippet?: string
  startOffset?: number
  endOffset?: number
  start?: { line: number; column: number }
  end?: { line: number; column: number }
}
