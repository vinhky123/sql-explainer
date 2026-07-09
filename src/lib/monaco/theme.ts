import type { Monaco } from '@monaco-editor/react'

export const SQL_THEME = 'sql-explainer'

export function registerSqlTheme(monaco: Monaco) {
  monaco.editor.defineTheme(SQL_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword.sql', foreground: 'c4b5fd' },
      { token: 'string.sql', foreground: '6ee7b7' },
      { token: 'number.sql', foreground: 'fbbf24' },
      { token: 'comment.sql', foreground: '64748b' },
      { token: 'identifier.sql', foreground: 'e2e8f0' },
      { token: 'delimiter.sql', foreground: '94a3b8' },
    ],
    colors: {
      'editor.background': '#0a0a0f',
      'editor.foreground': '#e2e8f0',
      'editorLineNumber.foreground': '#3f3f56',
      'editorLineNumber.activeForeground': '#a78bfa',
      'editor.selectionBackground': '#312e5688',
      'editor.lineHighlightBackground': '#15151f',
      'editorCursor.foreground': '#a78bfa',
      'editorWidget.background': '#0f0f17',
      'editorWidget.border': '#1e1e2a',
      'editorGutter.background': '#0a0a0f',
    },
  })
}
