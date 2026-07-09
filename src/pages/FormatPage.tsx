import { useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Workbench } from '@/components/layout/Workbench'
import { FormatOptionsPanel, defaultFormatOptions } from '@/features/formatter/FormatOptionsPanel'
import { formatSql, minifySql, type FormatOptions } from '@/lib/sql/formatter'
import { useSqlStore } from '@/store/sqlStore'
import { parseSql } from '@/lib/sql/parser'
import { Button } from '@/components/ui/button'
import { Copy, Download, Check, Wand2, AlertCircle } from 'lucide-react'
import { copyToClipboard, download } from '@/lib/utils'
import { useSeo, SrOnlyH1 } from '@/lib/seo'

export function FormatPage() {
  useSeo({
    title: 'SQL Formatter — Free Online SQL Formatter & Beautifier | SQL Explainer',
    description: 'Free online SQL formatter and beautifier. Supports PostgreSQL, MySQL, T-SQL, BigQuery, Snowflake and more. Configurable indentation, keyword case, and style. 100% client-side.',
  })
  const { sql, dialect } = useSqlStore()
  const [options, setOptions] = useState<FormatOptions>({ ...defaultFormatOptions, dialect })
  const [minify, setMinify] = useState(false)
  const [copied, setCopied] = useState(false)

  const parse = useMemo(() => parseSql(sql, dialect), [sql, dialect])

  const formatted = useMemo(() => {
    if (minify) return minifySql(sql, dialect)
    return formatSql(sql, { ...options, dialect })
  }, [sql, options, dialect, minify])

  const inputLines = sql.trim() ? sql.trim().split('\n').length : 0
  const outputLines = formatted.trim() ? formatted.trim().split('\n').length : 0

  const handleCopy = async () => {
    if (await copyToClipboard(formatted)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const handleDownload = () => download('formatted.sql', formatted)

  const handleApply = () => useSqlStore.getState().setSql(formatted)

  return (
    <>
      <SrOnlyH1>SQL Formatter & Beautifier</SrOnlyH1>
      <Workbench
        toolbar={
        <FormatOptionsPanel options={options} onChange={setOptions} minify={minify} onMinifyChange={setMinify} />
      }
      rightPanel={
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
            <Wand2 className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Formatted output</span>
            <span className="text-xs text-muted-foreground">
              {inputLines} → {outputLines} lines
            </span>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={handleApply} disabled={!formatted} title="Replace editor contents with formatted SQL">
              Apply
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDownload} disabled={!formatted}>
              <Download className="h-3.5 w-3.5" /> .sql
            </Button>
            <Button size="sm" variant="secondary" onClick={handleCopy} disabled={!formatted}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          {parse.ok ? (
            <div className="flex-1 min-h-0">
              <Editor
                height="100%"
                defaultLanguage="sql"
                value={formatted}
                theme="sql-explainer"
                options={{
                  readOnly: true,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 13,
                  lineHeight: 20,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 16, bottom: 16 },
                  renderLineHighlight: 'all',
                  wordWrap: 'on',
                  automaticLayout: true,
                  domReadOnly: true,
                }}
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <AlertCircle className="h-8 w-8 text-amber-400" />
              <p className="text-sm text-muted-foreground">
                Fix the syntax error in the editor to see formatted output.
              </p>
            </div>
          )}
        </div>
      }
    />
    </>
  )
}
