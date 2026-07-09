import type { ErdModel } from '@/lib/sql/erdExtractor'

export interface SchemaExplanation {
  summary: string
  relationships: { text: string; inferred: boolean }[]
  standaloneTables: string[]
}

function singularize(word: string): string {
  const w = word.toLowerCase()
  if (w.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (w.endsWith('ses') || w.endsWith('xes')) return word.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return word.slice(0, -1)
  return word
}

export function explainSchema(model: ErdModel): SchemaExplanation {
  const { tables, relationships, source } = model
  const tCount = tables.length
  const rCount = relationships.length

  const summary =
    source === 'select'
      ? `This query touches ${tCount} table${tCount !== 1 ? 's' : ''}${rCount > 0 ? ` and joins them via ${rCount} relationship${rCount !== 1 ? 's' : ''}` : ', with no joins between them'}.`
      : `This schema defines ${tCount} table${tCount !== 1 ? 's' : ''}${rCount > 0 ? ` linked by ${rCount} relationship${rCount !== 1 ? 's' : ''}` : ' with no relationships between them'}.`

  const relTexts = relationships.map((r) => {
    const fromSing = singularize(r.fromTable)
    const toSing = singularize(r.toTable)
    const verb = r.inferred ? 'likely references' : 'references'
    return {
      text: `${r.fromTable}.${r.fromColumn} ${verb} ${r.toTable}.${r.toColumn} — each ${fromSing} belongs to one ${toSing}.`,
      inferred: r.inferred,
    }
  })

  const linked = new Set<string>()
  relationships.forEach((r) => {
    linked.add(r.fromTable)
    linked.add(r.toTable)
  })
  const standaloneTables = tables.filter((t) => !linked.has(t.name)).map((t) => t.name)

  return { summary, relationships: relTexts, standaloneTables }
}
