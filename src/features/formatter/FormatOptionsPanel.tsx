import { cn } from '@/lib/utils'
import { defaultFormatOptions, type FormatOptions, type IndentStyle, type KeywordCase, type LogicalOperatorNewline } from '@/lib/sql/formatter'
import { Settings2 } from 'lucide-react'

interface FormatOptionsPanelProps {
  options: FormatOptions
  onChange: (opts: FormatOptions) => void
  minify: boolean
  onMinifyChange: (v: boolean) => void
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className={cn('inline-flex rounded-md border border-border bg-secondary/50 p-0.5', disabled && 'opacity-40 pointer-events-none')}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            value === o.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function FormatOptionsPanel({ options, onChange, minify, onMinifyChange }: FormatOptionsPanelProps) {
  const set = <K extends keyof FormatOptions>(key: K, val: FormatOptions[K]) =>
    onChange({ ...options, [key]: val })

  const disabled = minify

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Settings2 className="h-3.5 w-3.5" />
        Style
      </div>

      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Indent</span>
        <Segmented
          value={options.useTabs ? 'tabs' : String(options.tabWidth)}
          disabled={disabled}
          onChange={(v) => {
            if (v === 'tabs') onChange({ ...options, useTabs: true })
            else onChange({ ...options, useTabs: false, tabWidth: Number(v) })
          }}
          options={[
            { value: '2', label: '2' },
            { value: '4', label: '4' },
            { value: 'tabs', label: 'Tabs' },
          ]}
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Keywords</span>
        <Segmented
          value={options.keywordCase}
          disabled={disabled}
          onChange={(v) => set('keywordCase', v as KeywordCase)}
          options={[
            { value: 'upper', label: 'UPPER' },
            { value: 'lower', label: 'lower' },
            { value: 'preserve', label: 'Keep' },
          ]}
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Indent style</span>
        <Segmented
          value={options.indentStyle}
          disabled={disabled}
          onChange={(v) => set('indentStyle', v as IndentStyle)}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'tabularLeft', label: 'Tabular' },
          ]}
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">AND/OR</span>
        <Segmented
          value={options.logicalOperatorNewline}
          disabled={disabled}
          onChange={(v) => set('logicalOperatorNewline', v as LogicalOperatorNewline)}
          options={[
            { value: 'before', label: 'before' },
            { value: 'after', label: 'after' },
          ]}
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Width</span>
        <input
          type="number"
          min={40}
          max={200}
          step={10}
          value={options.expressionWidth}
          disabled={disabled}
          onChange={(e) => set('expressionWidth', Number(e.target.value))}
          className="h-7 w-16 rounded-md border border-border bg-secondary px-2 text-xs"
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Queries</span>
        <input
          type="number"
          min={0}
          max={5}
          value={options.linesBetweenQueries}
          disabled={disabled}
          onChange={(e) => set('linesBetweenQueries', Number(e.target.value))}
          className="h-7 w-12 rounded-md border border-border bg-secondary px-2 text-xs"
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={options.dense}
          disabled={disabled}
          onChange={(e) => set('dense', e.target.checked)}
          className="accent-primary"
        />
        Dense ops
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={minify}
          onChange={(e) => onMinifyChange(e.target.checked)}
          className="accent-primary"
        />
        Minify
      </label>
    </div>
  )
}

export { defaultFormatOptions }
