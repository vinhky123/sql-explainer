import type { ParseResult } from './parser'

export interface ErdColumn {
  name: string
  dataType: string
  nullable: boolean
  primaryKey: boolean
  unique: boolean
  defaultValue?: string
}

export interface ErdTable {
  name: string
  columns: ErdColumn[]
  source: 'ddl' | 'select'
}

export interface ErdRelationship {
  id: string
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  inferred: boolean
  label: string
}

export interface ErdIndex {
  name: string
  table: string
  columns: string[]
  unique: boolean
}

export type ErdSource = 'ddl' | 'select' | 'mixed' | 'empty'

export interface ErdModel {
  tables: ErdTable[]
  relationships: ErdRelationship[]
  indexes: ErdIndex[]
  source: ErdSource
  warnings: string[]
}

const EMPTY: ErdModel = { tables: [], relationships: [], indexes: [], source: 'empty', warnings: [] }

function colRefName(node: any): string {
  if (!node) return ''
  if (node.type === 'column_ref') {
    return node.column?.expr?.value ?? node.column?.value ?? ''
  }
  return ''
}

function formatDataType(def: any): string {
  if (!def) return ''
  let t = def.dataType ?? ''
  if (def.length != null && def.parentheses) {
    t += '(' + def.length + (def.scale != null ? ',' + def.scale : '') + ')'
  }
  if (Array.isArray(def.suffix) && def.suffix.length) {
    t += ' ' + def.suffix.join(' ')
  }
  return t
}

function defaultToStr(node: any): string | undefined {
  if (!node) return undefined
  const v = node.value
  if (v == null) return undefined
  if (typeof v === 'string') return v
  if (typeof v === 'object') {
    if (v.type === 'single_quote_string') return `'${v.value}'`
    if (v.type === 'function') {
      const fname = Array.isArray(v.name?.name) ? v.name.name.map((n: any) => n.value).join('') : ''
      return `${fname}()`
    }
    if (v.value != null) return String(v.value)
  }
  return String(v)
}

function singularize(word: string): string {
  const w = word.toLowerCase()
  if (w.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (w.endsWith('ses') || w.endsWith('xes')) return word.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return word.slice(0, -1)
  return word
}

function isFkName(col: string): boolean {
  return /_id$/.test(col) || /Id$/.test(col) || /_guid$/.test(col) || /Uuid$/.test(col)
}

function fkTargetTable(col: string): string {
  const m = col.match(/^(.+?)(_id|Id|_guid|Uuid)$/)
  if (!m) return ''
  const stem = m[1]
  return stem
}

function collectColumnRefs(node: any, acc: { table: string; column: string }[] = [], aliasMap: Map<string, string>, defaultTable = ''): { table: string; column: string }[] {
  if (!node || typeof node !== 'object') return acc
  if (Array.isArray(node)) {
    node.forEach((n) => collectColumnRefs(n, acc, aliasMap, defaultTable))
    return acc
  }
  if (node.type === 'column_ref') {
    const col = colRefName(node)
    const tblRef = node.table
    const real = tblRef ? (aliasMap.get(tblRef) ?? tblRef) : defaultTable
    acc.push({ table: real, column: col })
    return acc
  }
  for (const k of Object.keys(node)) {
    if (k === 'type') continue
    collectColumnRefs(node[k], acc, aliasMap, defaultTable)
  }
  return acc
}

function processCreateTable(stmt: any, tables: Map<string, ErdTable>, rels: ErdRelationship[], warnings: string[]) {
  const tableName = stmt.table?.[0]?.table
  if (!tableName) return
  const table: ErdTable = { name: tableName, columns: [], source: 'ddl' }
  const defs = Array.isArray(stmt.create_definitions) ? stmt.create_definitions : []

  for (const d of defs) {
    if (d.resource === 'column' && d.column) {
      const colName = colRefName(d.column)
      if (!colName) continue
      table.columns.push({
        name: colName,
        dataType: formatDataType(d.definition),
        nullable: !d.primary_key && (!d.nullable || d.nullable.type !== 'not null'),
        primaryKey: !!d.primary_key,
        unique: !!d.unique,
        defaultValue: defaultToStr(d.default_val),
      })
    } else if (d.resource === 'constraint' || d.constraint_type) {
      const ctype = (d.constraint_type || '').toUpperCase()
      if (ctype === 'PRIMARY KEY') {
        const cols = (d.definition || []).map(colRefName).filter(Boolean)
        for (const cn of cols) {
          const existing = table.columns.find((c) => c.name === cn)
          if (existing) existing.primaryKey = true
          else table.columns.push({ name: cn, dataType: '', nullable: false, primaryKey: true, unique: false })
        }
      } else if (ctype === 'UNIQUE') {
        const cols = (d.definition || []).map(colRefName).filter(Boolean)
        for (const cn of cols) {
          const existing = table.columns.find((c) => c.name === cn)
          if (existing) existing.unique = true
        }
      } else if (ctype === 'FOREIGN KEY' || ctype === 'FOREIGN') {
        const fromCols = (d.definition || []).map(colRefName).filter(Boolean)
        const toTable = d.reference_definition?.table?.[0]?.table
        const toCols = (d.reference_definition?.definition || []).map(colRefName).filter(Boolean)
        if (fromCols.length && toTable && toCols.length) {
          for (let i = 0; i < fromCols.length; i++) {
            const fc = fromCols[i]
            const tc = toCols[i] ?? toCols[0]
            if (!table.columns.find((c) => c.name === fc)) {
              table.columns.push({ name: fc, dataType: '', nullable: true, primaryKey: false, unique: false })
            }
            rels.push({
              id: `fk:${tableName}.${fc}->${toTable}.${tc}`,
              fromTable: tableName,
              fromColumn: fc,
              toTable,
              toColumn: tc,
              inferred: false,
              label: d.constraint || `FK`,
            })
          }
        } else {
          warnings.push(`Could not fully parse a FOREIGN KEY constraint on "${tableName}".`)
        }
      }
    }
  }
  tables.set(tableName, table)
}

function processAlter(stmt: any, tables: Map<string, ErdTable>, rels: ErdRelationship[], indexes: ErdIndex[], warnings: string[]) {
  const tableName = stmt.table?.[0]?.table
  if (!tableName) return
  const table = tables.get(tableName)
  const exprs = Array.isArray(stmt.expr) ? stmt.expr : []
  for (const ex of exprs) {
    const action = ex.action
    if (action === 'add') {
      if (ex.resource === 'column' && ex.column) {
        if (!table) {
          warnings.push(`ALTER TABLE on unknown table "${tableName}" — add a CREATE TABLE first.`)
          continue
        }
        const colName = colRefName(ex.column)
        if (colName && !table.columns.find((c) => c.name === colName)) {
          table.columns.push({
            name: colName,
            dataType: formatDataType(ex.definition),
            nullable: !ex.nullable || ex.nullable.type !== 'not null',
            primaryKey: !!ex.primary_key,
            unique: !!ex.unique,
            defaultValue: defaultToStr(ex.default_val),
          })
        }
      } else if (ex.resource === 'constraint' && ex.create_definitions) {
        const cd = ex.create_definitions
        const ctype = (cd.constraint_type || '').toUpperCase()
        if (ctype === 'FOREIGN KEY' || ctype === 'FOREIGN') {
          const fromCols = (cd.definition || []).map(colRefName).filter(Boolean)
          const toTable = cd.reference_definition?.table?.[0]?.table
          const toCols = (cd.reference_definition?.definition || []).map(colRefName).filter(Boolean)
          for (let i = 0; i < fromCols.length; i++) {
            const fc = fromCols[i]
            const tc = toCols[i] ?? toCols[0]
            if (table && !table.columns.find((c) => c.name === fc)) {
              table.columns.push({ name: fc, dataType: '', nullable: true, primaryKey: false, unique: false })
            }
            if (toTable && tc) {
              rels.push({
                id: `fk:${tableName}.${fc}->${toTable}.${tc}`,
                fromTable: tableName,
                fromColumn: fc,
                toTable,
                toColumn: tc,
                inferred: false,
                label: cd.constraint || 'FK',
              })
            }
          }
        } else if (ctype === 'PRIMARY KEY' && table) {
          ;(cd.definition || []).map(colRefName).forEach((cn: string) => {
            const existing = table.columns.find((c) => c.name === cn)
            if (existing) existing.primaryKey = true
          })
        }
      }
    } else if (action === 'drop') {
      if (ex.resource === 'column') {
        const droppedName = colRefName(ex.column)
        if (!droppedName) continue
        if (!table) {
          warnings.push(`ALTER TABLE ${tableName} DROP references unknown table.`)
          continue
        }
        table.columns = table.columns.filter((c) => c.name !== droppedName)
        for (let i = rels.length - 1; i >= 0; i--) {
          const r = rels[i]
          if (
            (r.fromTable === tableName && r.fromColumn === droppedName) ||
            (r.toTable === tableName && r.toColumn === droppedName)
          ) {
            rels.splice(i, 1)
          }
        }
      } else if (ex.resource === 'constraint' && ex.constraint) {
        const cname = ex.constraint
        for (let i = rels.length - 1; i >= 0; i--) {
          const r = rels[i]
          if (r.fromTable === tableName && r.label === cname) rels.splice(i, 1)
        }
      } else {
        warnings.push(`Unsupported ALTER TABLE DROP on "${tableName}" — ignored.`)
      }
    } else if (action === 'rename') {
      if (ex.resource === 'table' && ex.table) {
        const newName = ex.table
        const old = tables.get(tableName)
        if (old) {
          old.name = newName
          tables.delete(tableName)
          tables.set(newName, old)
          for (const r of rels) {
            if (r.fromTable === tableName) r.fromTable = newName
            if (r.toTable === tableName) r.toTable = newName
          }
          for (const idx of indexes) {
            if (idx.table === tableName) idx.table = newName
          }
        } else {
          warnings.push(`ALTER TABLE ${tableName} RENAME references unknown table.`)
        }
      } else if (ex.resource === 'column' && ex.column && ex.to) {
        const fromName = colRefName(ex.column)
        const toName = typeof ex.to === 'string' ? ex.to : colRefName(ex.to)
        if (table && fromName && toName) {
          const col = table.columns.find((c) => c.name === fromName)
          if (col) {
            col.name = toName
            for (const r of rels) {
              if (r.fromTable === tableName && r.fromColumn === fromName) r.fromColumn = toName
              if (r.toTable === tableName && r.toColumn === fromName) r.toColumn = toName
            }
          }
        }
      } else {
        warnings.push(`Unsupported ALTER TABLE RENAME on "${tableName}" — ignored.`)
      }
    } else {
      warnings.push(`Unsupported ALTER TABLE action "${action}" on "${tableName}" — ignored.`)
    }
  }
}

function processCreateIndex(stmt: any, indexes: ErdIndex[], tables: Map<string, ErdTable>, warnings: string[]) {
  const tableName = stmt.table?.table
  if (!tableName) return
  const cols = (stmt.index_columns || []).map(colRefName).filter(Boolean)
  if (!cols.length) return
  indexes.push({
    name: stmt.index || `idx_${tableName}`,
    table: tableName,
    columns: cols,
    unique: (stmt.index_type || '').toUpperCase() === 'UNIQUE',
  })
  if (!tables.has(tableName)) {
    warnings.push(`Index "${stmt.index}" references unknown table "${tableName}".`)
  }
}

function collectJoinPairs(on: any): { left: any; right: any }[] {
  if (!on || on.type !== 'binary_expr') return []
  if (on.operator === 'AND') {
    return [...collectJoinPairs(on.left), ...collectJoinPairs(on.right)]
  }
  if (on.operator === '=') return [{ left: on.left, right: on.right }]
  return []
}

function processSelect(stmt: any, tables: Map<string, ErdTable>, rels: ErdRelationship[]) {
  const fromArr = Array.isArray(stmt.from) ? stmt.from : []
  if (!fromArr.length) return
  const aliasMap = new Map<string, string>()
  for (const f of fromArr) {
    const real = f.table
    if (real) {
      if (f.as) aliasMap.set(f.as, real)
      aliasMap.set(real, real)
    }
  }
  const realTables: string[] = Array.from(new Set(fromArr.map((f: any) => f.table).filter((t: any): t is string => typeof t === 'string')))
  const defaultTable: string = realTables.length === 1 ? realTables[0] : ''

  const referencedCols = new Map<string, Set<string>>()
  const ensure = (t: string, c: string) => {
    if (!t || !c) return
    if (!referencedCols.has(t)) referencedCols.set(t, new Set())
    referencedCols.get(t)!.add(c)
  }

  for (const c of stmt.columns || []) {
    if (c.type === 'star') {
      fromArr.forEach((f: any) => f.table && ensure(f.table, '*'))
    } else {
      const refs = collectColumnRefs(c.expr, [], aliasMap, defaultTable)
      refs.forEach((r) => ensure(r.table, r.column))
    }
  }

  for (let i = 1; i < fromArr.length; i++) {
    const f = fromArr[i]
    for (const pair of collectJoinPairs(f.on)) {
      const l = pair.left
      const r = pair.right
      if (l?.type === 'column_ref' && r?.type === 'column_ref') {
        const lReal = l.table ? (aliasMap.get(l.table) ?? l.table) : ''
        const rReal = r.table ? (aliasMap.get(r.table) ?? r.table) : ''
        const lCol = colRefName(l)
        const rCol = colRefName(r)
        ensure(lReal, lCol)
        ensure(rReal, rCol)
        const leftIsFk = isFkName(lCol)
        const fromT = leftIsFk ? lReal : rReal
        const fromC = leftIsFk ? lCol : rCol
        const toT = leftIsFk ? rReal : lReal
        const toC = leftIsFk ? rCol : lCol
        if (fromT && toT && fromC && toC) {
          rels.push({
            id: `join:${fromT}.${fromC}->${toT}.${toC}`,
            fromTable: fromT,
            fromColumn: fromC,
            toTable: toT,
            toColumn: toC,
            inferred: false,
            label: f.join || 'JOIN',
          })
        }
      }
    }
  }

  if (stmt.where) {
    collectColumnRefs(stmt.where, [], aliasMap, defaultTable).forEach((r) => ensure(r.table, r.column))
  }
  if (stmt.groupby?.columns) {
    stmt.groupby.columns.forEach((c: any) => collectColumnRefs(c, [], aliasMap, defaultTable).forEach((r) => ensure(r.table, r.column)))
  }
  if (stmt.having) {
    collectColumnRefs(stmt.having, [], aliasMap, defaultTable).forEach((r) => ensure(r.table, r.column))
  }
  if (Array.isArray(stmt.orderby)) {
    stmt.orderby.forEach((o: any) => collectColumnRefs(o.expr, [], aliasMap, defaultTable).forEach((r) => ensure(r.table, r.column)))
  }

  for (const [tname, cols] of referencedCols) {
    if (!tname) continue
    if (!tables.has(tname)) {
      tables.set(tname, { name: tname, columns: [], source: 'select' })
    }
    const table = tables.get(tname)!
    for (const c of cols) {
      if (c === '*' || table.columns.find((x) => x.name === c)) continue
      table.columns.push({ name: c, dataType: '', nullable: true, primaryKey: false, unique: false })
    }
  }
}

function inferRelationships(tables: Map<string, ErdTable>, rels: ErdRelationship[]) {
  const explicit = new Set(rels.map((r) => `${r.fromTable}.${r.fromColumn}`))
  const tableNames = Array.from(tables.keys())
  const pluralLookup = new Map<string, string>()
  for (const t of tableNames) {
    pluralLookup.set(t.toLowerCase(), t)
    pluralLookup.set(singularize(t).toLowerCase(), t)
  }

  for (const table of tables.values()) {
    if (table.source === 'select') continue
    for (const col of table.columns) {
      if (explicit.has(`${table.name}.${col.name}`)) continue
      if (col.primaryKey) continue
      if (!isFkName(col.name)) continue
      const stem = fkTargetTable(col.name)
      if (!stem) continue
      const candidates = [stem, stem + 's', stem + 'es', singularize(stem), stem + '_']
      let targetTable = ''
      for (const cand of candidates) {
        if (pluralLookup.has(cand.toLowerCase())) {
          targetTable = pluralLookup.get(cand.toLowerCase())!
          break
        }
      }
      if (!targetTable) continue
      const target = tables.get(targetTable)
      if (!target) continue
      const pkCol = target.columns.find((c) => c.primaryKey)
      const toCol = pkCol?.name ?? 'id'
      if (!target.columns.find((c) => c.name === toCol)) continue
      rels.push({
        id: `infer:${table.name}.${col.name}->${targetTable}.${toCol}`,
        fromTable: table.name,
        fromColumn: col.name,
        toTable: targetTable,
        toColumn: toCol,
        inferred: true,
        label: 'guessed',
      })
      explicit.add(`${table.name}.${col.name}`)
    }
  }
}

export function extractErd(parse: ParseResult): ErdModel {
  if (!parse.ok || !parse.ast) return { ...EMPTY }
  const stmts = Array.isArray(parse.ast) ? parse.ast : [parse.ast]
  if (!stmts.length) return { ...EMPTY }

  const tables = new Map<string, ErdTable>()
  const rels: ErdRelationship[] = []
  const indexes: ErdIndex[] = []
  const warnings: string[] = []
  const sources = new Set<ErdSource>()

  for (const stmt of stmts) {
    if (!stmt || typeof stmt !== 'object') continue
    const t = stmt.type
    if (t === 'create' && stmt.keyword === 'table') {
      sources.add('ddl')
      processCreateTable(stmt, tables, rels, warnings)
    } else if (t === 'alter') {
      sources.add('ddl')
      processAlter(stmt, tables, rels, indexes, warnings)
    } else if (t === 'create' && stmt.keyword === 'index') {
      sources.add('ddl')
      processCreateIndex(stmt, indexes, tables, warnings)
    } else if (t === 'select') {
      sources.add('select')
      processSelect(stmt, tables, rels)
    }
  }

  inferRelationships(tables, rels)

  if (sources.size === 0) return { ...EMPTY }
  const source: ErdSource = sources.has('ddl') && sources.has('select') ? 'mixed' : (sources.has('ddl') ? 'ddl' : 'select')

  return {
    tables: Array.from(tables.values()),
    relationships: rels,
    indexes,
    source,
    warnings,
  }
}
