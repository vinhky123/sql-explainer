import { toPng, toSvg } from 'html-to-image'
import type { ErdModel, ErdColumn } from '@/lib/sql/erdExtractor'
import { download } from '@/lib/utils'

function dbmlColumnSettings(col: ErdColumn): string {
  const parts: string[] = []
  if (col.primaryKey) parts.push('pk')
  if (!col.nullable && !col.primaryKey) parts.push('not null')
  if (col.unique && !col.primaryKey) parts.push('unique')
  if (col.defaultValue != null && col.defaultValue !== '') {
    const v = col.defaultValue
    if (v.includes('(')) parts.push(`default: \`${v}\``)
    else if (v.startsWith("'")) parts.push(`default: ${v}`)
    else parts.push(`default: '${v}'`)
  }
  return parts.length ? ` [${parts.join(', ')}]` : ''
}

export function exportDbml(model: ErdModel): string {
  const lines: string[] = []
  for (const table of model.tables) {
    lines.push(`Table ${table.name} {`)
    if (table.columns.length === 0) {
      lines.push(`  // no columns detected`)
    } else {
      for (const col of table.columns) {
        const type = col.dataType || 'unknown'
        lines.push(`  ${col.name} ${type}${dbmlColumnSettings(col)}`)
      }
    }
    lines.push(`}`)
    lines.push('')
  }

  const seen = new Set<string>()
  for (const rel of model.relationships) {
    const key = `${rel.fromTable}.${rel.fromColumn}->${rel.toTable}.${rel.toColumn}`
    if (seen.has(key)) continue
    seen.add(key)
    const name = rel.inferred ? '' : `:${rel.label.replace(/\s+/g, '_')}`
    const note = rel.inferred ? ' // inferred via naming heuristic' : ''
    lines.push(`Ref${name}: ${rel.fromTable}.${rel.fromColumn} > ${rel.toTable}.${rel.toColumn}${note}`)
  }

  if (model.indexes.length) {
    lines.push('')
    lines.push('// Indexes')
    for (const idx of model.indexes) {
      lines.push(`// ${idx.unique ? 'UNIQUE ' : ''}INDEX ${idx.name} ON ${idx.table} (${idx.columns.join(', ')})`)
    }
  }

  return lines.join('\n')
}

export function exportDbmlFile(model: ErdModel): void {
  download('schema.dbml', exportDbml(model), 'text/plain')
}

async function captureViewport(
  format: 'png' | 'svg',
  filename: string,
): Promise<void> {
  const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!viewport) return
  const controls = document.querySelector('.react-flow__controls') as HTMLElement | null
  const prevDisplay = controls?.style.display
  if (controls) controls.style.display = 'none'

  const opts = {
    backgroundColor: '#09090b',
    pixelRatio: 2,
    style: { transform: 'none' },
  }

  try {
    const dataUrl = format === 'png' ? await toPng(viewport, opts) : await toSvg(viewport, opts)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    a.click()
  } finally {
    if (controls && prevDisplay !== undefined) controls.style.display = prevDisplay
  }
}

export function exportPng(): Promise<void> {
  return captureViewport('png', 'erd.png')
}

export function exportSvg(): Promise<void> {
  return captureViewport('svg', 'erd.svg')
}
