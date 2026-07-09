import type { Finding } from '@/types'
import type { Dialect } from '@/types'
import { hasJinja, stripJinja } from '@/lib/sql/jinja'

export const SYSTEM_PROMPT = `You are SQL Explainer's AI assistant — an expert SQL engineer helping a developer understand and improve a query.

Rules:
- Be concise and concrete. Use short paragraphs and bullet points.
- Walk through what the query does step by step: tables, joins, filters, grouping, ordering.
- When suggesting optimizations, explain *why* and give a concrete rewrite when possible.
- Do not invent schema or columns that aren't in the query.
- Use markdown sparingly: **bold** for key terms, \`code\` for identifiers, and fenced blocks for SQL.
- If the query is fine, say so briefly rather than inventing problems.
- If the input is a dbt model (Jinja templating), reason about the compiled SQL. Recognize ref()/source()/var() and explain them as table references or variables.`

const MAX_SQL_CHARS = 8000

export function buildExplainUserMessage(sql: string, dialect: Dialect, findings: Finding[] = []): string {
  const parts: string[] = []
  parts.push(`Explain this ${dialect} SQL query. Walk through what it does, then note any performance concerns or improvements.`)

  let body = sql.trim()
  if (hasJinja(body)) {
    const r = stripJinja(body)
    body = r.stripped.trim()
    parts.push('\nThis is a **dbt model** with Jinja templating. The compiled (de-templated) SQL below was used for analysis:')
    if (r.refs.length > 0) parts.push(`- refs (other models/sources): ${r.refs.map((x) => `\`${x}\``).join(', ')}`)
    if (r.vars.length > 0) parts.push(`- vars: ${r.vars.map((x) => `\`${x}\``).join(', ')}`)
    if (r.warnings.length > 0) parts.push(`- unresolved: ${r.warnings.length} expression(s) replaced with NULL`)
  }

  if (findings.length > 0) {
    parts.push('\nA heuristic optimizer already flagged these issues — reference them if relevant:')
    for (const f of findings.slice(0, 12)) {
      parts.push(`- [${f.severity}] ${f.title}: ${f.suggestion}`)
    }
  } else {
    parts.push('\nThe heuristic optimizer found no issues — focus on explaining what the query does.')
  }

  const truncated = body.length > MAX_SQL_CHARS ? body.slice(0, MAX_SQL_CHARS) + '\n-- …(truncated)' : body
  parts.push('\nSQL:')
  parts.push('```sql')
  parts.push(truncated)
  parts.push('```')
  return parts.join('\n')
}

export function buildFollowUpUserMessage(text: string): string {
  return text.trim()
}
