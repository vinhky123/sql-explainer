import { describe, it, expect } from 'vitest'
import {
  builtinFunctions,
  isAggregateName,
  isBuiltinFunction,
  functionInfo,
  aggregateCount,
  totalCount,
  funcNameOf,
  isAggregateExpr,
  supportedDialects,
} from './functions'
import type { Dialect } from '@/types'

const ALL: Dialect[] = supportedDialects()

describe('built-in function registry — coverage', () => {
  it('ships DuckDB alongside the other 10 engines', () => {
    expect(ALL).toContain('duckdb')
    expect(ALL).toHaveLength(11)
  })

  it('has a non-trivial set of functions per dialect', () => {
    for (const d of ALL) {
      expect(totalCount(d)).toBeGreaterThan(40)
    }
  })

  it('recognizes the SQL-standard aggregates on every dialect', () => {
    for (const d of ALL) {
      for (const fn of ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']) {
        expect(isAggregateName(fn, d), `${fn} on ${d}`).toBe(true)
      }
    }
  })
})

describe('aggregate detection per dialect', () => {
  it('PostgreSQL: STRING_AGG, BOOL_OR, ARRAY_AGG, CORR, MEDIAN are aggregates', () => {
    for (const fn of ['STRING_AGG', 'BOOL_AND', 'BOOL_OR', 'ARRAY_AGG', 'CORR', 'MEDIAN', 'PERCENTILE_CONT', 'REGR_SLOPE']) {
      expect(isAggregateName(fn, 'postgresql')).toBe(true)
    }
  })

  it('MySQL/MariaDB: GROUP_CONCAT, BIT_XOR, JSON_ARRAYAGG are aggregates', () => {
    for (const d of ['mysql', 'mariadb'] as const) {
      for (const fn of ['GROUP_CONCAT', 'BIT_XOR', 'JSON_ARRAYAGG', 'STDDEV_POP']) {
        expect(isAggregateName(fn, d)).toBe(true)
      }
    }
  })

  it('SQLite: TOTAL and GROUP_CONCAT are aggregates', () => {
    expect(isAggregateName('TOTAL', 'sqlite')).toBe(true)
    expect(isAggregateName('GROUP_CONCAT', 'sqlite')).toBe(true)
  })

  it('T-SQL: COUNT_BIG, STRING_AGG, STDEVP, GROUPING_ID are aggregates', () => {
    for (const fn of ['COUNT_BIG', 'STRING_AGG', 'STDEVP', 'GROUPING_ID', 'CHECKSUM_AGG']) {
      expect(isAggregateName(fn, 'tsql')).toBe(true)
    }
  })

  it('BigQuery: APPROX_COUNT_DISTINCT, ANY_VALUE, LOGICAL_AND, COUNTIF are aggregates', () => {
    for (const fn of ['APPROX_COUNT_DISTINCT', 'ANY_VALUE', 'LOGICAL_AND', 'COUNTIF', 'MAX_BY']) {
      expect(isAggregateName(fn, 'bigquery')).toBe(true)
    }
  })

  it('Snowflake: LISTAGG, BOOLAND_AGG, HLL, KURTOSIS, COUNT_IF are aggregates', () => {
    for (const fn of ['LISTAGG', 'BOOLAND_AGG', 'HLL', 'KURTOSIS', 'COUNT_IF', 'OBJECT_AGG']) {
      expect(isAggregateName(fn, 'snowflake')).toBe(true)
    }
  })

  it('Redshift: LISTAGG, MEDIAN, APPROXIMATE, PERCENTILE_CONT are aggregates', () => {
    for (const fn of ['LISTAGG', 'MEDIAN', 'APPROXIMATE', 'PERCENTILE_CONT', 'BIT_AND']) {
      expect(isAggregateName(fn, 'redshift')).toBe(true)
    }
  })

  it('DB2: LISTAGG, CORRELATION, COUNT_BIG, XMLAGG are aggregates', () => {
    for (const fn of ['LISTAGG', 'CORRELATION', 'COUNT_BIG', 'XMLAGG', 'COVARIANCE']) {
      expect(isAggregateName(fn, 'db2')).toBe(true)
    }
  })

  it('Flink SQL: LISTAGG, COLLECT, STDDEV_POP are aggregates', () => {
    for (const fn of ['LISTAGG', 'COLLECT', 'STDDEV_POP', 'FIRST_VALUE']) {
      expect(isAggregateName(fn, 'flinksql')).toBe(true)
    }
  })

  it('DuckDB: STRING_AGG, LISTAGG, LIST, PRODUCT, QUANTILE_CONT, HISTOGRAM are aggregates', () => {
    for (const fn of ['STRING_AGG', 'LISTAGG', 'LIST', 'PRODUCT', 'QUANTILE_CONT', 'HISTOGRAM', 'BOOL_AND', 'ARBITRARY']) {
      expect(isAggregateName(fn, 'duckdb')).toBe(true)
    }
  })

  it('treats scalar functions as non-aggregates', () => {
    expect(isAggregateName('LOWER', 'postgresql')).toBe(false)
    expect(isAggregateName('CONCAT', 'mysql')).toBe(false)
    expect(isAggregateName('DATEADD', 'tsql')).toBe(false)
    expect(isAggregateName('LENGTH', 'duckdb')).toBe(false)
  })

  it('is case-insensitive and rejects empty names', () => {
    expect(isAggregateName('count', 'mysql')).toBe(true)
    expect(isAggregateName('', 'postgresql')).toBe(false)
    expect(isAggregateName('Sum', 'sqlite')).toBe(true)
  })

  it('aggregateCount grows substantially vs the bare 5 standards', () => {
    for (const d of ALL) {
      expect(aggregateCount(d)).toBeGreaterThanOrEqual(5)
    }
    expect(aggregateCount('postgresql')).toBeGreaterThan(10)
    expect(aggregateCount('bigquery')).toBeGreaterThan(10)
    expect(aggregateCount('duckdb')).toBeGreaterThan(15)
  })
})

describe('isBuiltinFunction / functionInfo', () => {
  it('recognizes common scalars across engines', () => {
    for (const d of ALL) {
      expect(isBuiltinFunction('COALESCE', d)).toBe(true)
      expect(isBuiltinFunction('CAST', d)).toBe(true)
    }
  })

  it('functionInfo returns merged categories including aggregate where applicable', () => {
    const info = functionInfo('PERCENTILE_CONT', 'postgresql')
    expect(info).toBeTruthy()
    expect(info!.categories).toContain('aggregate')
    expect(info!.categories).toContain('window')
  })

  it('dedupes duplicate entries and merges their categories', () => {
    const pgNames = builtinFunctions('postgresql').map((f) => f.name)
    const uniq = new Set(pgNames.map((n) => n.toUpperCase()))
    expect(pgNames.length).toBe(uniq.size)
  })
})

describe('AST helpers (funcNameOf / isAggregateExpr)', () => {
  it('extracts the function name from a parsed function node', () => {
    const node = {
      type: 'function',
      name: { type: 'function', name: [{ type: 'default', value: 'STRING_AGG' }] },
      args: { type: 'expr_list', value: [{ type: 'column_ref', table: null, column: { expr: { type: 'default', value: 'name' } } }] },
    }
    expect(funcNameOf(node)).toBe('STRING_AGG')
  })

  it('isAggregateExpr flags aggr_func nodes and registry-matched function nodes', () => {
    expect(isAggregateExpr({ type: 'aggr_func', name: 'SUM' }, 'postgresql')).toBe(true)
    expect(isAggregateExpr({
      type: 'function',
      name: { name: [{ value: 'STRING_AGG' }] },
    }, 'postgresql')).toBe(true)
    expect(isAggregateExpr({
      type: 'function',
      name: { name: [{ value: 'LOWER' }] },
    }, 'postgresql')).toBe(false)
    expect(isAggregateExpr(null, 'postgresql')).toBe(false)
    expect(isAggregateExpr({ type: 'window_func', name: 'ROW_NUMBER' }, 'postgresql')).toBe(false)
  })
})
