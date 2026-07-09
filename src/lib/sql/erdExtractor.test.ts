import { describe, it, expect } from 'vitest'
import { extractErd } from './erdExtractor'
import { parseSql } from './parser'

function model(sql: string) {
  return extractErd(parseSql(sql, 'postgresql'))
}

describe('extractErd — H6 ALTER drop/rename', () => {
  it('drops a column via ALTER TABLE DROP COLUMN', () => {
    const m = model(`CREATE TABLE t (a INT, b INT, c INT); ALTER TABLE t DROP COLUMN b;`)
    const t = m.tables.find((x) => x.name === 't')!
    expect(t.columns.map((c) => c.name)).toEqual(['a', 'c'])
  })

  it('drops a column via ALTER TABLE DROP b (no COLUMN keyword)', () => {
    const m = model(`CREATE TABLE t (a INT, b INT); ALTER TABLE t DROP b;`)
    const t = m.tables.find((x) => x.name === 't')!
    expect(t.columns.map((c) => c.name)).toEqual(['a'])
  })

  it('removes relationships that referenced a dropped column', () => {
    const m = model(
      `CREATE TABLE u (id INT PRIMARY KEY);
       CREATE TABLE t (a INT, u_id INT, CONSTRAINT fk_t_u FOREIGN KEY (u_id) REFERENCES u(id));
       ALTER TABLE t DROP COLUMN u_id;`,
    )
    expect(m.relationships.filter((r) => r.fromColumn === 'u_id')).toHaveLength(0)
  })

  it('renames a table via ALTER TABLE RENAME TO', () => {
    const m = model(`CREATE TABLE t (a INT); ALTER TABLE t RENAME TO t2;`)
    expect(m.tables.find((x) => x.name === 't')).toBeUndefined()
    expect(m.tables.find((x) => x.name === 't2')).toBeDefined()
  })

  it('drops an explicit relationship via ALTER TABLE DROP CONSTRAINT', () => {
    const m = model(
      `CREATE TABLE u (id INT PRIMARY KEY);
       CREATE TABLE t (u_id INT, CONSTRAINT fk_t_u FOREIGN KEY (u_id) REFERENCES u(id));
       ALTER TABLE t DROP CONSTRAINT fk_t_u;`,
    )
    expect(m.relationships.filter((r) => r.fromTable === 't' && r.fromColumn === 'u_id' && !r.inferred)).toHaveLength(0)
  })
})

describe('extractErd — H7 composite JOIN ON (AND)', () => {
  it('creates a relationship for each = pair in a composite ON', () => {
    const m = model(`SELECT * FROM a JOIN b ON a.k1 = b.k1 AND a.k2 = b.k2`)
    const rels = m.relationships.filter((r) => r.inferred === false)
    expect(rels.length).toBe(2)
  })

  it('single-condition ON still yields one relationship', () => {
    const m = model(`SELECT * FROM a JOIN b ON a.k1 = b.k1`)
    const rels = m.relationships.filter((r) => r.inferred === false)
    expect(rels.length).toBe(1)
  })
})

describe('extractErd — M3 unprefixed column lineage', () => {
  it('attributes unprefixed columns to the single in-scope table', () => {
    const m = model(`SELECT name, email FROM users`)
    const t = m.tables.find((x) => x.name === 'users')!
    expect(t).toBeDefined()
    const cols = t.columns.map((c) => c.name)
    expect(cols).toContain('name')
    expect(cols).toContain('email')
  })

  it('does not attribute unprefixed columns when multiple tables are in scope', () => {
    const m = model(`SELECT name FROM users JOIN orders ON users.id = orders.user_id`)
    const users = m.tables.find((x) => x.name === 'users')!
    expect(users).toBeDefined()
    expect(users.columns.map((c) => c.name)).not.toContain('name')
  })
})

describe('extractErd — smoke', () => {
  it('returns empty model for unparseable input', () => {
    const m = model(`SELECT FROM`)
    expect(m.source).toBe('empty')
    expect(m.tables).toEqual([])
  })

  it('parses a CREATE TABLE with PK and FK', () => {
    const m = model(
      `CREATE TABLE users (id INT PRIMARY KEY);
       CREATE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES users(id));`,
    )
    expect(m.tables.length).toBe(2)
    expect(m.relationships.length).toBeGreaterThanOrEqual(1)
  })
})
