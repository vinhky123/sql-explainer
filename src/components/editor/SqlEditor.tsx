import { useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useSqlStore } from '@/store/sqlStore'
import { useEditorStore } from '@/store/editorStore'
import { registerSqlTheme, SQL_THEME } from '@/lib/monaco/theme'
import type { ParseError } from '@/types'

interface SqlEditorProps {
  error?: ParseError | null
}

export function SqlEditor({ error }: SqlEditorProps) {
  const { sql, setSql } = useSqlStore()
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const setEditor = useEditorStore((s) => s.setEditor)

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    registerSqlTheme(monaco)
    monaco.editor.setTheme(SQL_THEME)
    setEditor(editor)
  }

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (!model) return
    if (error?.line && error?.column) {
      monaco.editor.setModelMarkers(model, 'sql-parse', [
        {
          startLineNumber: error.line,
          startColumn: error.column,
          endLineNumber: error.line,
          endColumn: error.column + 1,
          message: error.message ?? 'Syntax error',
          severity: monaco.MarkerSeverity.Warning,
        },
      ])
      return () => monaco.editor.setModelMarkers(model, 'sql-parse', [])
    }
    monaco.editor.setModelMarkers(model, 'sql-parse', [])
  }, [error])

  return (
    <div className="h-full w-full overflow-hidden">
      <Editor
        height="100%"
        defaultLanguage="sql"
        value={sql}
        onChange={(v) => setSql(v ?? '')}
        onMount={handleMount}
        theme={SQL_THEME}
        beforeMount={registerSqlTheme}
        options={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 13,
          lineHeight: 20,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 16, bottom: 16 },
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
          tabSize: 2,
          wordWrap: 'on',
          automaticLayout: true,
          glyphMargin: true,
          bracketPairColorization: { enabled: true },
        }}
        loading={<div className="flex h-full items-center justify-center text-muted-foreground text-sm">Loading editor…</div>}
      />
    </div>
  )
}
