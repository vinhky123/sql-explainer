import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Dialect } from '@/types'

interface SqlState {
  sql: string
  dialect: Dialect
  setSql: (sql: string) => void
  setDialect: (dialect: Dialect) => void
  loadSample: (sql: string) => void
  clear: () => void
}

export const useSqlStore = create<SqlState>()(
  persist(
    (set) => ({
      sql: '',
      dialect: 'postgresql',
      setSql: (sql) => set({ sql }),
      setDialect: (dialect) => set({ dialect }),
      loadSample: (sql) => set({ sql }),
      clear: () => set({ sql: '' }),
    }),
    { name: 'sql-explainer-sql' },
  ),
)
