import type { Dialect } from '@/types'

export type FuncCategory =
  | 'aggregate'
  | 'window'
  | 'string'
  | 'numeric'
  | 'datetime'
  | 'json'
  | 'array'
  | 'condition'
  | 'system'
  | 'geo'
  | 'crypto'

export interface FuncInfo {
  name: string
  categories: FuncCategory[]
  description?: string
}

type FuncList = FuncInfo[]

function cat(name: string, categories: FuncCategory[], description?: string): FuncInfo {
  return { name, categories, description }
}

const STANDARD_AGGREGATES: FuncList = [
  cat('COUNT', ['aggregate']),
  cat('SUM', ['aggregate']),
  cat('AVG', ['aggregate']),
  cat('MIN', ['aggregate']),
  cat('MAX', ['aggregate']),
]

const STANDARD_SCALARS: FuncList = [
  cat('COALESCE', ['condition']),
  cat('NULLIF', ['condition']),
  cat('GREATEST', ['condition']),
  cat('LEAST', ['condition']),
  cat('CASE', ['condition']),
  cat('CAST', ['system']),
  cat('CONVERT', ['system']),
  cat('ABS', ['numeric']),
  cat('CEIL', ['numeric']),
  cat('CEILING', ['numeric']),
  cat('FLOOR', ['numeric']),
  cat('ROUND', ['numeric']),
  cat('TRUNC', ['numeric']),
  cat('TRUNCATE', ['numeric']),
  cat('MOD', ['numeric']),
  cat('POWER', ['numeric']),
  cat('SQRT', ['numeric']),
  cat('EXP', ['numeric']),
  cat('LN', ['numeric']),
  cat('LOG', ['numeric']),
  cat('LOG10', ['numeric']),
  cat('LOG2', ['numeric']),
  cat('SIGN', ['numeric']),
  cat('PI', ['numeric']),
  cat('RANDOM', ['numeric']),
  cat('LENGTH', ['string']),
  cat('CHAR_LENGTH', ['string']),
  cat('CHARACTER_LENGTH', ['string']),
  cat('LOWER', ['string']),
  cat('UPPER', ['string']),
  cat('SUBSTR', ['string']),
  cat('SUBSTRING', ['string']),
  cat('TRIM', ['string']),
  cat('LTRIM', ['string']),
  cat('RTRIM', ['string']),
  cat('CONCAT', ['string']),
  cat('REPLACE', ['string']),
  cat('POSITION', ['string']),
  cat('LEFT', ['string']),
  cat('RIGHT', ['string']),
  cat('REPEAT', ['string']),
  cat('REVERSE', ['string']),
  cat('CURRENT_DATE', ['datetime']),
  cat('CURRENT_TIME', ['datetime']),
  cat('CURRENT_TIMESTAMP', ['datetime']),
  cat('NOW', ['datetime']),
  cat('EXTRACT', ['datetime']),
  cat('DATE_PART', ['datetime']),
  cat('DATE_TRUNC', ['datetime']),
]

const STANDARD_WINDOW: FuncList = [
  cat('ROW_NUMBER', ['window']),
  cat('RANK', ['window']),
  cat('DENSE_RANK', ['window']),
  cat('NTILE', ['window']),
  cat('LAG', ['window']),
  cat('LEAD', ['window']),
  cat('FIRST_VALUE', ['window']),
  cat('LAST_VALUE', ['window']),
  cat('NTH_VALUE', ['window']),
  cat('PERCENT_RANK', ['window']),
  cat('CUME_DIST', ['window']),
  cat('PERCENTILE_CONT', ['window', 'aggregate']),
  cat('PERCENTILE_DISC', ['window', 'aggregate']),
]

const POSTGRES_AGGREGATES: FuncList = [
  cat('STRING_AGG', ['aggregate']),
  cat('ARRAY_AGG', ['aggregate', 'array']),
  cat('BOOL_AND', ['aggregate']),
  cat('BOOL_OR', ['aggregate']),
  cat('EVERY', ['aggregate']),
  cat('STDDEV', ['aggregate']),
  cat('STDDEV_POP', ['aggregate']),
  cat('STDDEV_SAMP', ['aggregate']),
  cat('VARIANCE', ['aggregate']),
  cat('VAR_POP', ['aggregate']),
  cat('VAR_SAMP', ['aggregate']),
  cat('MEDIAN', ['aggregate']),
  cat('MODE', ['aggregate']),
  cat('CORR', ['aggregate']),
  cat('COVAR_POP', ['aggregate']),
  cat('COVAR_SAMP', ['aggregate']),
  cat('REGR_SLOPE', ['aggregate']),
  cat('REGR_INTERCEPT', ['aggregate']),
  cat('REGR_R2', ['aggregate']),
  cat('REGR_AVGX', ['aggregate']),
  cat('REGR_AVGY', ['aggregate']),
  cat('REGR_SXX', ['aggregate']),
  cat('REGR_SYY', ['aggregate']),
  cat('REGR_SXY', ['aggregate']),
  cat('BIT_AND', ['aggregate']),
  cat('BIT_OR', ['aggregate']),
  cat('XMLAGG', ['aggregate']),
  cat('JSON_AGG', ['aggregate', 'json']),
  cat('JSONB_AGG', ['aggregate', 'json']),
  cat('JSON_OBJECT_AGG', ['aggregate', 'json']),
  cat('JSONB_OBJECT_AGG', ['aggregate', 'json']),
  cat('RANGE_AGG', ['aggregate']),
  cat('PERCENTILE_CONT', ['window', 'aggregate']),
  cat('PERCENTILE_DISC', ['window', 'aggregate']),
]

const POSTGRES_SCALARS: FuncList = [
  cat('SPLIT_PART', ['string']),
  cat('BTRIM', ['string']),
  cat('LPAD', ['string']),
  cat('RPAD', ['string']),
  cat('INITCAP', ['string']),
  cat('TRANSLATE', ['string']),
  cat('LATERAL', ['system']),
  cat('AGE', ['datetime']),
  cat('TO_CHAR', ['datetime']),
  cat('TO_DATE', ['datetime']),
  cat('TO_NUMBER', ['numeric']),
  cat('TO_TIMESTAMP', ['datetime']),
  cat('MAKE_DATE', ['datetime']),
  cat('MAKE_INTERVAL', ['datetime']),
  cat('MAKE_TIMESTAMP', ['datetime']),
  cat('GEN_RANDOM_UUID', ['crypto']),
  cat('MD5', ['crypto']),
  cat('SHA256', ['crypto']),
  cat('GEOGPOINT', ['geo']),
  cat('ROW_TO_JSON', ['json']),
  cat('JSON_BUILD_OBJECT', ['json']),
  cat('JSONB_BUILD_OBJECT', ['json']),
  cat('REGEXP_MATCH', ['string']),
  cat('REGEXP_MATCHES', ['string']),
  cat('REGEXP_REPLACE', ['string']),
  cat('REGEXP_SPLIT_TO_ARRAY', ['string']),
  cat('REGEXP_SPLIT_TO_TABLE', ['string']),
]

const MYSQL_AGGREGATES: FuncList = [
  cat('BIT_AND', ['aggregate']),
  cat('BIT_OR', ['aggregate']),
  cat('BIT_XOR', ['aggregate']),
  cat('GROUP_CONCAT', ['aggregate']),
  cat('JSON_ARRAYAGG', ['aggregate', 'json']),
  cat('JSON_OBJECTAGG', ['aggregate', 'json']),
  cat('STD', ['aggregate']),
  cat('STDDEV', ['aggregate']),
  cat('STDDEV_POP', ['aggregate']),
  cat('STDDEV_SAMP', ['aggregate']),
  cat('VARIANCE', ['aggregate']),
  cat('VAR_POP', ['aggregate']),
  cat('VAR_SAMP', ['aggregate']),
]

const MYSQL_SCALARS: FuncList = [
  cat('IF', ['condition']),
  cat('IFNULL', ['condition']),
  cat('ISNULL', ['condition']),
  cat('CONCAT_WS', ['string']),
  cat('FORMAT', ['string']),
  cat('FIELD', ['string']),
  cat('LOCATE', ['string']),
  cat('INSTR', ['string']),
  cat('MID', ['string']),
  cat('SUBSTRING_INDEX', ['string']),
  cat('ELT', ['string']),
  cat('INSERT', ['string']),
  cat('DATE_FORMAT', ['datetime']),
  cat('STR_TO_DATE', ['datetime']),
  cat('DATEDIFF', ['datetime']),
  cat('TIMESTAMPDIFF', ['datetime']),
  cat('UNIX_TIMESTAMP', ['datetime']),
  cat('FROM_UNIXTIME', ['datetime']),
  cat('DATE_ADD', ['datetime']),
  cat('DATE_SUB', ['datetime']),
  cat('CURDATE', ['datetime']),
  cat('CURTIME', ['datetime']),
  cat('UTC_TIMESTAMP', ['datetime']),
  cat('YEAR', ['datetime']),
  cat('MONTH', ['datetime']),
  cat('DAY', ['datetime']),
  cat('HOUR', ['datetime']),
  cat('MINUTE', ['datetime']),
  cat('SECOND', ['datetime']),
  cat('LAST_INSERT_ID', ['system']),
  cat('UUID', ['crypto']),
  cat('SHA1', ['crypto']),
  cat('SHA2', ['crypto']),
  cat('CRC32', ['crypto']),
  cat('JSON_EXTRACT', ['json']),
  cat('JSON_UNQUOTE', ['json']),
  cat('JSON_CONTAINS', ['json']),
  cat('JSON_ARRAY', ['json']),
  cat('JSON_OBJECT', ['json']),
  cat('REGEXP', ['string']),
  cat('CONV', ['numeric']),
  cat('RAND', ['numeric']),
  cat('POW', ['numeric']),
]

const SQLITE_AGGREGATES: FuncList = [
  cat('TOTAL', ['aggregate']),
  cat('GROUP_CONCAT', ['aggregate']),
]

const SQLITE_SCALARS: FuncList = [
  cat('IFNULL', ['condition']),
  cat('IIF', ['condition']),
  cat('INSTR', ['string']),
  cat('PRINTF', ['string']),
  cat('GROUP_CONCAT', ['aggregate']),
  cat('STRFTIME', ['datetime']),
  cat('DATE', ['datetime']),
  cat('TIME', ['datetime']),
  cat('DATETIME', ['datetime']),
  cat('JULIANDAY', ['datetime']),
  cat('LAST_INSERT_ROWID', ['system']),
  cat('LIKELIHOOD', ['system']),
  cat('LIKELY', ['system']),
  cat('UNLIKELY', ['system']),
  cat('QUOTE', ['string']),
  cat('TYPEOF', ['system']),
  cat('ZEROBLOB', ['system']),
  cat('HEX', ['crypto']),
  cat('RANDOMBLOB', ['crypto']),
]

const TSQL_AGGREGATES: FuncList = [
  cat('COUNT_BIG', ['aggregate']),
  cat('CHECKSUM_AGG', ['aggregate']),
  cat('GROUPING', ['aggregate']),
  cat('GROUPING_ID', ['aggregate']),
  cat('STDEV', ['aggregate']),
  cat('STDEVP', ['aggregate']),
  cat('VAR', ['aggregate']),
  cat('VARP', ['aggregate']),
  cat('STRING_AGG', ['aggregate']),
]

const TSQL_SCALARS: FuncList = [
  cat('ISNULL', ['condition']),
  cat('IIF', ['condition']),
  cat('CHOOSE', ['condition']),
  cat('DATEADD', ['datetime']),
  cat('DATEDIFF', ['datetime']),
  cat('DATEPART', ['datetime']),
  cat('DATENAME', ['datetime']),
  cat('GETDATE', ['datetime']),
  cat('GETUTCDATE', ['datetime']),
  cat('SYSDATETIME', ['datetime']),
  cat('SYSUTCDATETIME', ['datetime']),
  cat('YEAR', ['datetime']),
  cat('MONTH', ['datetime']),
  cat('DAY', ['datetime']),
  cat('EOMONTH', ['datetime']),
  cat('SWITCHOFFSET', ['datetime']),
  cat('TODATETIMEOFFSET', ['datetime']),
  cat('CONCAT', ['string']),
  cat('CONCAT_WS', ['string']),
  cat('FORMAT', ['string']),
  cat('STUFF', ['string']),
  cat('CHARINDEX', ['string']),
  cat('PATINDEX', ['string']),
  cat('REPLICATE', ['string']),
  cat('SPACE', ['string']),
  cat('QUOTENAME', ['string']),
  cat('PARSENAME', ['string']),
  cat('STR', ['numeric']),
  cat('TRY_CAST', ['system']),
  cat('TRY_CONVERT', ['system']),
  cat('PARSE', ['system']),
  cat('TRY_PARSE', ['system']),
  cat('NEWID', ['crypto']),
  cat('NEWSEQUENTIALID', ['crypto']),
  cat('HASHBYTES', ['crypto']),
  cat('CHECKSUM', ['crypto']),
  cat('BINARY_CHECKSUM', ['crypto']),
  cat('SCOPE_IDENTITY', ['system']),
  cat('IDENT_CURRENT', ['system']),
  cat('ROWCOUNT_BIG', ['system']),
  cat('SERVERPROPERTY', ['system']),
]

const BIGQUERY_AGGREGATES: FuncList = [
  cat('ANY_VALUE', ['aggregate']),
  cat('ARRAY_AGG', ['aggregate', 'array']),
  cat('ARRAY_CONCAT_AGG', ['aggregate', 'array']),
  cat('COUNTIF', ['aggregate']),
  cat('LOGICAL_AND', ['aggregate']),
  cat('LOGICAL_OR', ['aggregate']),
  cat('BIT_AND', ['aggregate']),
  cat('BIT_OR', ['aggregate']),
  cat('BIT_XOR', ['aggregate']),
  cat('MAX_BY', ['aggregate']),
  cat('MIN_BY', ['aggregate']),
  cat('STDDEV', ['aggregate']),
  cat('STDDEV_POP', ['aggregate']),
  cat('STDDEV_SAMP', ['aggregate']),
  cat('VARIANCE', ['aggregate']),
  cat('VAR_POP', ['aggregate']),
  cat('VAR_SAMP', ['aggregate']),
  cat('APPROX_COUNT_DISTINCT', ['aggregate']),
  cat('APPROX_QUANTILES', ['aggregate']),
  cat('APPROX_TOP_COUNT', ['aggregate']),
  cat('APPROX_TOP_SUM', ['aggregate']),
]

const BIGQUERY_SCALARS: FuncList = [
  cat('SAFE_CAST', ['system']),
  cat('ARRAY', ['array']),
  cat('ARRAY_LENGTH', ['array']),
  cat('ARRAY_TO_STRING', ['array']),
  cat('ARRAY_CONCAT', ['array']),
  cat('ARRAY_REVERSE', ['array']),
  cat('GENERATE_ARRAY', ['array']),
  cat('UNNEST', ['array']),
  cat('STRUCT', ['system']),
  cat('NET_REG_DOMAIN', ['string']),
  cat('REGEXP_CONTAINS', ['string']),
  cat('REGEXP_EXTRACT', ['string']),
  cat('REGEXP_EXTRACT_ALL', ['string']),
  cat('REGEXP_REPLACE', ['string']),
  cat('SPLIT', ['string']),
  cat('SAFE_DIVIDE', ['numeric']),
  cat('SAFE_ADD', ['numeric']),
  cat('SAFE_MULTIPLY', ['numeric']),
  cat('SAFE_NEGATE', ['numeric']),
  cat('IEEE_DIVIDE', ['numeric']),
  cat('CURRENT_DATE', ['datetime']),
  cat('CURRENT_DATETIME', ['datetime']),
  cat('CURRENT_TIMESTAMP', ['datetime']),
  cat('DATE', ['datetime']),
  cat('DATETIME', ['datetime']),
  cat('TIMESTAMP', ['datetime']),
  cat('TIMESTAMP_ADD', ['datetime']),
  cat('TIMESTAMP_SUB', ['datetime']),
  cat('TIMESTAMP_DIFF', ['datetime']),
  cat('TIMESTAMP_TRUNC', ['datetime']),
  cat('FORMAT_DATE', ['datetime']),
  cat('FORMAT_TIMESTAMP', ['datetime']),
  cat('PARSE_DATE', ['datetime']),
  cat('PARSE_TIMESTAMP', ['datetime']),
  cat('DATE_ADD', ['datetime']),
  cat('DATE_SUB', ['datetime']),
  cat('DATE_DIFF', ['datetime']),
  cat('DATE_TRUNC', ['datetime']),
  cat('EXTRACT', ['datetime']),
  cat('GENERATE_UUID', ['crypto']),
  cat('MD5', ['crypto']),
  cat('SHA1', ['crypto']),
  cat('SHA256', ['crypto']),
  cat('SHA512', ['crypto']),
  cat('ST_GEOGPOINT', ['geo']),
  cat('ST_DISTANCE', ['geo']),
  cat('ST_UNION', ['geo']),
  cat('GENERATE_DATE_ARRAY', ['array']),
  cat('GENERATE_TIMESTAMP_ARRAY', ['array']),
  cat('FARM_FINGERPRINT', ['crypto']),
]

const SNOWFLAKE_AGGREGATES: FuncList = [
  cat('ANY_VALUE', ['aggregate']),
  cat('ARRAY_AGG', ['aggregate', 'array']),
  cat('ARRAYAGG', ['aggregate', 'array']),
  cat('BITAND_AGG', ['aggregate']),
  cat('BITOR_AGG', ['aggregate']),
  cat('BITXOR_AGG', ['aggregate']),
  cat('BOOLAND_AGG', ['aggregate']),
  cat('BOOLOR_AGG', ['aggregate']),
  cat('BOOLXOR_AGG', ['aggregate']),
  cat('COUNT_IF', ['aggregate']),
  cat('HASH_AGG', ['aggregate']),
  cat('LISTAGG', ['aggregate']),
  cat('MEDIAN', ['aggregate']),
  cat('MODE', ['aggregate']),
  cat('OBJECT_AGG', ['aggregate']),
  cat('STDDEV', ['aggregate']),
  cat('STDDEV_POP', ['aggregate']),
  cat('STDDEV_SAMP', ['aggregate']),
  cat('VAR_POP', ['aggregate']),
  cat('VAR_SAMP', ['aggregate']),
  cat('VARIANCE', ['aggregate']),
  cat('APPROX_TOP_K', ['aggregate']),
  cat('HLL', ['aggregate']),
  cat('HLL_ACCUMULATE', ['aggregate']),
  cat('KURTOSIS', ['aggregate']),
  cat('SKEW', ['aggregate']),
]

const SNOWFLAKE_SCALARS: FuncList = [
  cat('IFF', ['condition']),
  cat('NULLIFZERO', ['condition']),
  cat('ZEROIFNULL', ['condition']),
  cat('DIV0', ['numeric']),
  cat('DIV0NULL', ['numeric']),
  cat('TRY_CAST', ['system']),
  cat('ARRAY_CONSTRUCT', ['array']),
  cat('ARRAY_SIZE', ['array']),
  cat('ARRAY_TO_STRING', ['array']),
  cat('ARRAY_INSERT', ['array']),
  cat('OBJECT_CONSTRUCT', ['system']),
  cat('OBJECT_INSERT', ['system']),
  cat('VARIANT', ['system']),
  cat('TO_VARIANT', ['system']),
  cat('GET', ['json']),
  cat('GET_PATH', ['json']),
  cat('PARSE_JSON', ['json']),
  cat('TRY_PARSE_JSON', ['json']),
  cat('ARRAY_EXTRACT', ['array']),
  cat('REGEXP_LIKE', ['string']),
  cat('REGEXP_SUBSTR', ['string']),
  cat('RLIKE', ['string']),
  cat('SPLIT_PART', ['string']),
  cat('DATEADD', ['datetime']),
  cat('DATEDIFF', ['datetime']),
  cat('DATE_PART', ['datetime']),
  cat('DATE_TRUNC', ['datetime']),
  cat('TO_TIMESTAMP', ['datetime']),
  cat('TO_DATE', ['datetime']),
  cat('TO_TIME', ['datetime']),
  cat('TO_CHAR', ['datetime']),
  cat('TRY_TO_DATE', ['datetime']),
  cat('TRY_TO_TIMESTAMP', ['datetime']),
  cat('CURRENT_TIMESTAMP', ['datetime']),
  cat('SYSDATE', ['datetime']),
  cat('HASH', ['crypto']),
  cat('MD5', ['crypto']),
  cat('MD5_HEX', ['crypto']),
  cat('SHA1', ['crypto']),
  cat('SHA2', ['crypto']),
  cat('UUID_STRING', ['crypto']),
  cat('ST_MAKEPOINT', ['geo']),
  cat('ST_DISTANCE', ['geo']),
  cat('ST_X', ['geo']),
  cat('ST_Y', ['geo']),
]

const REDSHIFT_AGGREGATES: FuncList = [
  cat('LISTAGG', ['aggregate']),
  cat('MEDIAN', ['aggregate']),
  cat('PERCENTILE_CONT', ['window', 'aggregate']),
  cat('PERCENTILE_DISC', ['window', 'aggregate']),
  cat('APPROXIMATE', ['aggregate']),
  cat('BIT_AND', ['aggregate']),
  cat('BIT_OR', ['aggregate']),
  cat('STDDEV', ['aggregate']),
  cat('VARIANCE', ['aggregate']),
  cat('VAR_POP', ['aggregate']),
  cat('VAR_SAMP', ['aggregate']),
  cat('STDDEV_POP', ['aggregate']),
  cat('STDDEV_SAMP', ['aggregate']),
  cat('STRING_AGG', ['aggregate']),
]

const REDSHIFT_SCALARS: FuncList = [
  ...POSTGRES_SCALARS.filter((f) => !['GEN_RANDOM_UUID', 'JSONB_BUILD_OBJECT'].includes(f.name)),
  cat('CONVERT_TIMEZONE', ['datetime']),
  cat('GETDATE', ['datetime']),
  cat('SYSDATE', ['datetime']),
  cat('HASH', ['crypto']),
  cat('ST_DISTANCE', ['geo']),
]

const DB2_AGGREGATES: FuncList = [
  cat('ARRAY_AGG', ['aggregate', 'array']),
  cat('LISTAGG', ['aggregate']),
  cat('XMLAGG', ['aggregate']),
  cat('XMLGROUP', ['aggregate']),
  cat('COUNT_BIG', ['aggregate']),
  cat('STDDEV', ['aggregate']),
  cat('VARIANCE', ['aggregate']),
  cat('CORRELATION', ['aggregate']),
  cat('COVARIANCE', ['aggregate']),
  cat('COVARIANCE_SAMP', ['aggregate']),
  cat('COVARIANCE_POP', ['aggregate']),
  cat('MEDIAN', ['aggregate']),
  cat('PERCENTILE_CONT', ['window', 'aggregate']),
  cat('BITAND', ['aggregate']),
  cat('BITOR', ['aggregate']),
  cat('BITXOR', ['aggregate']),
]

const DB2_SCALARS: FuncList = [
  cat('VALUE', ['condition']),
  cat('DATAPARTITIONNUM', ['system']),
  cat('HASHEDVALUE', ['system']),
  cat('IDENTITY_VAL_LOCAL', ['system']),
  cat('ROW_NUMBER', ['window']),
  cat('DAYS', ['datetime']),
  cat('DAYOFWEEK', ['datetime']),
  cat('DAYOFYEAR', ['datetime']),
  cat('DAYNAME', ['datetime']),
  cat('MONTHNAME', ['datetime']),
  cat('TIMESTAMPDIFF', ['datetime']),
  cat('TO_CHAR', ['datetime']),
  cat('TO_DATE', ['datetime']),
  cat('TO_TIMESTAMP', ['datetime']),
  cat('WEEK', ['datetime']),
  cat('WEEK_ISO', ['datetime']),
  cat('QUARTER', ['datetime']),
  cat('DECRYPT_CHAR', ['crypto']),
  cat('ENCRYPT', ['crypto']),
  cat('STRIP', ['string']),
  cat('LOCATE', ['string']),
  cat('POSSTR', ['string']),
  cat('INSERT', ['string']),
  cat('DIGITS', ['string']),
]

const FLINK_AGGREGATES: FuncList = [
  cat('LISTAGG', ['aggregate']),
  cat('ARRAY_AGG', ['aggregate', 'array']),
  cat('COLLECT', ['aggregate']),
  cat('STDDEV_POP', ['aggregate']),
  cat('STDDEV_SAMP', ['aggregate']),
  cat('VAR_POP', ['aggregate']),
  cat('VAR_SAMP', ['aggregate']),
  cat('VARIANCE', ['aggregate']),
  cat('FIRST_VALUE', ['window', 'aggregate']),
  cat('LAST_VALUE', ['window', 'aggregate']),
]

const FLINK_SCALARS: FuncList = [
  cat('JSON_OBJECT', ['json']),
  cat('JSON_VALUE', ['json']),
  cat('JSON_QUERY', ['json']),
  cat('JSON_EXISTS', ['json']),
  cat('JSON_ARRAY', ['json']),
  cat('TO_TIMESTAMP', ['datetime']),
  cat('TO_TIMESTAMP_LTZ', ['datetime']),
  cat('TIMESTAMPDIFF', ['datetime']),
  cat('DATE_FORMAT', ['datetime']),
  cat('WINDOW_START', ['datetime']),
  cat('WINDOW_END', ['datetime']),
  cat('HOP_START', ['datetime']),
  cat('HOP_END', ['datetime']),
  cat('TUMBLE', ['system']),
  cat('HOP', ['system']),
  cat('SESSION', ['system']),
  cat('OVER', ['system']),
  cat('UUID', ['crypto']),
  cat('MD5', ['crypto']),
  cat('SHA1', ['crypto']),
  cat('SHA2', ['crypto']),
  cat('REGEXP_EXTRACT', ['string']),
  cat('REGEXP_REPLACE', ['string']),
  cat('URL_DECODE', ['string']),
  cat('URL_ENCODE', ['string']),
]

const DUCKDB_AGGREGATES: FuncList = [
  cat('STRING_AGG', ['aggregate']),
  cat('LISTAGG', ['aggregate']),
  cat('LIST', ['aggregate', 'array']),
  cat('ARRAY_AGG', ['aggregate', 'array']),
  cat('PRODUCT', ['aggregate']),
  cat('STDDEV_POP', ['aggregate']),
  cat('STDDEV_SAMP', ['aggregate']),
  cat('STDDEV', ['aggregate']),
  cat('VAR_POP', ['aggregate']),
  cat('VAR_SAMP', ['aggregate']),
  cat('VARIANCE', ['aggregate']),
  cat('MEDIAN', ['aggregate']),
  cat('QUANTILE_CONT', ['aggregate']),
  cat('QUANTILE_DISC', ['aggregate']),
  cat('MODE', ['aggregate']),
  cat('BOOL_AND', ['aggregate']),
  cat('BOOL_OR', ['aggregate']),
  cat('BITWISE_AND', ['aggregate']),
  cat('BITWISE_OR', ['aggregate']),
  cat('BITWISE_XOR', ['aggregate']),
  cat('FIRST', ['aggregate']),
  cat('LAST', ['aggregate']),
  cat('ARBITRARY', ['aggregate']),
  cat('HISTOGRAM', ['aggregate']),
  cat('RESPECT_NULLS_AGG', ['aggregate']),
  cat('PRODUCT', ['aggregate']),
  cat('COUNT_IF', ['aggregate']),
]

const DUCKDB_SCALARS: FuncList = [
  ...POSTGRES_SCALARS,
  cat('LIST_VALUE', ['array']),
  cat('ARRAY_VALUE', ['array']),
  cat('LIST_EXTRACT', ['array']),
  cat('ARRAY_EXTRACT', ['array']),
  cat('LIST_CONCAT', ['array']),
  cat('ARRAY_CONCAT', ['array']),
  cat('LIST_LENGTH', ['array']),
  cat('ARRAY_LENGTH', ['array']),
  cat('STRUCT_EXTRACT', ['system']),
  cat('STRUCT_PACK', ['system']),
  cat('ROW', ['system']),
  cat('COLUMNS', ['system']),
  cat('UNNEST', ['array']),
  cat('GENERATE_SERIES', ['array']),
  cat('RANGE', ['array']),
  cat('MAKE_TIMESTAMP', ['datetime']),
  cat('EPOCH', ['datetime']),
  cat('STRPTIME', ['datetime']),
  cat('STRFTIME', ['datetime']),
  cat('AGE', ['datetime']),
  cat('TRY_CAST', ['system']),
  cat('REGEXP_FULL_MATCH', ['string']),
  cat('REGEXP_MATCHES', ['string']),
  cat('REGEXP_SPLIT_TO_ARRAY', ['string']),
  cat('STRING_SPLIT', ['string']),
  cat('STRING_SPLIT_REGEX', ['string']),
  cat('LIST_TRANSFORM', ['array']),
  cat('LIST_FILTER', ['array']),
  cat('LIST_AGGREGATE', ['array']),
  cat('JSON_EXTRACT', ['json']),
  cat('JSON_EXTRACT_STRING', ['json']),
  cat('JSON_OBJECT', ['json']),
  cat('JSON_ARRAY', ['json']),
  cat('TO_JSON', ['json']),
  cat('ARRAY_TO_JSON', ['json']),
  cat('BASE64', ['crypto']),
  cat('HASH', ['crypto']),
  cat('MD5', ['crypto']),
  cat('SHA1', ['crypto']),
  cat('SHA256', ['crypto']),
]

function dedupe(lists: FuncList[]): FuncList {
  const map = new Map<string, FuncInfo>()
  for (const list of lists) {
    for (const f of list) {
      const key = f.name.toUpperCase()
      const existing = map.get(key)
      if (existing) {
        const merged = new Set([...existing.categories, ...f.categories])
        map.set(key, { name: existing.name, categories: [...merged] })
      } else {
        map.set(key, { ...f, categories: [...f.categories] })
      }
    }
  }
  return [...map.values()]
}

const ALL_DIALECTS: Dialect[] = [
  'postgresql',
  'mysql',
  'mariadb',
  'sqlite',
  'tsql',
  'bigquery',
  'snowflake',
  'redshift',
  'db2',
  'flinksql',
  'duckdb',
]

const PER_DIALECT: Record<Dialect, FuncList> = {
  postgresql: dedupe([STANDARD_AGGREGATES, STANDARD_SCALARS, STANDARD_WINDOW, POSTGRES_AGGREGATES, POSTGRES_SCALARS]),
  mysql: dedupe([STANDARD_AGGREGATES, STANDARD_SCALARS, STANDARD_WINDOW, MYSQL_AGGREGATES, MYSQL_SCALARS]),
  mariadb: dedupe([STANDARD_AGGREGATES, STANDARD_SCALARS, STANDARD_WINDOW, MYSQL_AGGREGATES, MYSQL_SCALARS]),
  sqlite: dedupe([STANDARD_AGGREGATES, STANDARD_SCALARS, STANDARD_WINDOW, SQLITE_AGGREGATES, SQLITE_SCALARS]),
  tsql: dedupe([STANDARD_AGGREGATES, STANDARD_SCALARS, STANDARD_WINDOW, TSQL_AGGREGATES, TSQL_SCALARS]),
  bigquery: dedupe([STANDARD_AGGREGATES, STANDARD_SCALARS, STANDARD_WINDOW, BIGQUERY_AGGREGATES, BIGQUERY_SCALARS]),
  snowflake: dedupe([STANDARD_AGGREGATES, STANDARD_SCALARS, STANDARD_WINDOW, SNOWFLAKE_AGGREGATES, SNOWFLAKE_SCALARS]),
  redshift: dedupe([STANDARD_AGGREGATES, STANDARD_SCALARS, STANDARD_WINDOW, REDSHIFT_AGGREGATES, REDSHIFT_SCALARS]),
  db2: dedupe([STANDARD_AGGREGATES, STANDARD_SCALARS, STANDARD_WINDOW, DB2_AGGREGATES, DB2_SCALARS]),
  flinksql: dedupe([STANDARD_AGGREGATES, STANDARD_SCALARS, STANDARD_WINDOW, FLINK_AGGREGATES, FLINK_SCALARS]),
  duckdb: dedupe([STANDARD_AGGREGATES, STANDARD_SCALARS, STANDARD_WINDOW, DUCKDB_AGGREGATES, DUCKDB_SCALARS]),
}

const byDialectCache = new Map<Dialect, { byName: Map<string, FuncInfo>; aggregates: Set<string> }>()

function ensureIndex(dialect: Dialect) {
  let idx = byDialectCache.get(dialect)
  if (idx) return idx
  const byName = new Map<string, FuncInfo>()
  const aggregates = new Set<string>()
  for (const f of PER_DIALECT[dialect]) {
    byName.set(f.name.toUpperCase(), f)
    if (f.categories.includes('aggregate')) aggregates.add(f.name.toUpperCase())
  }
  idx = { byName, aggregates }
  byDialectCache.set(dialect, idx)
  return idx
}

export function builtinFunctions(dialect: Dialect): FuncInfo[] {
  return PER_DIALECT[dialect]
}

export function aggregateFunctionNames(dialect: Dialect): Set<string> {
  return ensureIndex(dialect).aggregates
}

export function isAggregateName(name: string, dialect: Dialect): boolean {
  if (!name) return false
  return ensureIndex(dialect).aggregates.has(name.toUpperCase())
}

export function isBuiltinFunction(name: string, dialect: Dialect): boolean {
  if (!name) return false
  return ensureIndex(dialect).byName.has(name.toUpperCase())
}

export function functionInfo(name: string, dialect: Dialect): FuncInfo | undefined {
  return ensureIndex(dialect).byName.get(name.toUpperCase())
}

export function supportedDialects(): Dialect[] {
  return ALL_DIALECTS
}

export function aggregateCount(dialect: Dialect): number {
  return ensureIndex(dialect).aggregates.size
}

export function totalCount(dialect: Dialect): number {
  return PER_DIALECT[dialect].length
}

export function funcNameOf(node: any): string {
  if (!node) return ''
  if (node.name?.name) {
    const inner = node.name.name
    return Array.isArray(inner) ? inner.map((n: any) => n.value ?? '').join('') : String(inner)
  }
  return typeof node.name === 'string' ? node.name : ''
}

export function isAggregateExpr(node: any, dialect: Dialect): boolean {
  if (!node) return false
  if (node.type === 'aggr_func') return true
  if (node.type === 'window_func') return false
  if (node.type === 'function') {
    return isAggregateName(funcNameOf(node), dialect)
  }
  return false
}
