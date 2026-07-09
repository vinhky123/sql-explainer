export type JinjaTagKind = 'expr' | 'stmt' | 'comment'

export interface JinjaRegion {
  kind: JinjaTagKind
  originalStart: number
  originalEnd: number
  strippedStart: number
  strippedEnd: number
  raw: string
  inner: string
  placeholder: string
  controlBlock: boolean
}

export interface StripJinjaResult {
  stripped: string
  regions: JinjaRegion[]
  refs: string[]
  vars: string[]
  warnings: string[]
  strippedToOriginal: number[]
  originalToStripped: number[]
}

export function hasJinja(sql: string): boolean {
  return sql.includes('{{') || sql.includes('{%') || sql.includes('{#')
}

export function findTagClose(sql: string, from: number, close: string): number {
  let i = from
  let q: '' | "'" | '"' = ''
  const c0 = close[0]
  const c1 = close[1]
  while (i < sql.length) {
    const ch = sql[i]
    if (q) {
      if (ch === q) q = ''
      i++
      continue
    }
    if (ch === "'" || ch === '"') {
      q = ch
      i++
      continue
    }
    if (ch === c0 && sql[i + 1] === c1) return i
    i++
  }
  return -1
}

const CONTROL_OPENERS = new Set(['if', 'for', 'macro', 'block', 'raw'])

function findControlBlockEnd(sql: string, from: number, head: string): number {
  const closer = 'end' + head
  let i = from
  let depth = 1
  while (i < sql.length) {
    const ch = sql[i]
    const nx = sql[i + 1] ?? ''
    if (ch === '{' && nx === '%') {
      const end = findTagClose(sql, i + 2, '%}')
      if (end < 0) return sql.length
      const innerHead = sql.slice(i + 2, end).trim().split(/[\s(]/)[0]?.toLowerCase() ?? ''
      if (innerHead === head) depth++
      else if (innerHead === closer) {
        depth--
        if (depth === 0) return end + 2
      }
      i = end + 2
      continue
    }
    if (ch === '{' && (nx === '{' || nx === '#')) {
      const close = nx === '{' ? '}}' : '#}'
      const end = findTagClose(sql, i + 2, close)
      i = end < 0 ? sql.length : end + 2
      continue
    }
    if (ch === "'") {
      i++
      while (i < sql.length && sql[i] !== "'") i++
      i++
      continue
    }
    if (ch === '"') {
      i++
      while (i < sql.length && sql[i] !== '"') i++
      i++
      continue
    }
    i++
  }
  return sql.length
}

function splitArgs(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let q: '' | "'" | '"' = ''
  let cur = ''
  for (const ch of s) {
    if (q) {
      cur += ch
      if (ch === q) q = ''
      continue
    }
    if (ch === "'" || ch === '"') {
      q = ch
      cur += ch
      continue
    }
    if (ch === '(' || ch === '[') {
      depth++
      cur += ch
      continue
    }
    if (ch === ')' || ch === ']') {
      depth--
      cur += ch
      continue
    }
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

function stripQuotes(s: string): string {
  const t = s.trim()
  if (
    t.length >= 2 &&
    ((t[0] === "'" && t[t.length - 1] === "'") ||
      (t[0] === '"' && t[t.length - 1] === '"'))
  ) {
    return t.slice(1, -1)
  }
  return t
}

function sanitizeIdent(name: string): string {
  let s = name.replace(/[^A-Za-z0-9_]/g, '_')
  if (!s) s = 'jinja'
  if (/^[0-9]/.test(s)) s = '_' + s
  return s
}

interface ExprResolution {
  placeholder: string
  ref?: string
  varName?: string
  note?: string
}

function resolveExpr(inner: string, jinjaExprId: number): ExprResolution {
  const s = inner.trim()

  let m = s.match(/^ref\s*\(([\s\S]*)\)\s*$/i)
  if (m) {
    const args = splitArgs(m[1])
    const name = stripQuotes(args[args.length - 1] ?? '')
    if (name) return { placeholder: sanitizeIdent(name), ref: name }
  }

  m = s.match(/^source\s*\(([\s\S]*)\)\s*$/i)
  if (m) {
    const args = splitArgs(m[1])
    const name = stripQuotes(args[args.length - 1] ?? '')
    if (name) return { placeholder: sanitizeIdent(name), ref: name }
  }

  m = s.match(/^var\s*\(([\s\S]*)\)\s*$/i)
  if (m) {
    const args = splitArgs(m[1])
    const varName = stripQuotes(args[0] ?? '')
    const rawDef = (args[1] ?? '').trim()
    let placeholder = 'NULL'
    if (rawDef !== '') {
      if (/^-?\d+(\.\d+)?$/.test(rawDef)) placeholder = rawDef
      else if (/^(true|false)$/i.test(rawDef)) placeholder = rawDef.toLowerCase()
      else if (/^null$/i.test(rawDef)) placeholder = 'NULL'
      else if (/^(['"]).*\1$/.test(rawDef)) placeholder = rawDef
      else placeholder = 'NULL'
    }
    return { placeholder, varName }
  }

  if (/^config\s*\(/i.test(s)) return { placeholder: '' }

  if (/^-?\d+(\.\d+)?$/.test(s)) return { placeholder: s }
  if (/^(true|false)$/i.test(s)) return { placeholder: s.toLowerCase() }
  if (/^(null|none)$/i.test(s)) return { placeholder: 'NULL' }

  return {
    placeholder: `(jinja_expr_${jinjaExprId})`,
    note: `Unresolved Jinja expression "{{ ${s} }}" replaced with placeholder (jinja_expr_${jinjaExprId})`,
  }
}

export function stripJinja(sql: string): StripJinjaResult {
  const regions: JinjaRegion[] = []
  const refs: string[] = []
  const vars: string[] = []
  const warnings: string[] = []
  const strippedChars: string[] = []
  const strippedToOriginal: number[] = []
  const n = sql.length
  const originalToStripped: number[] = new Array(n + 1)

  let i = 0
  let jinjaExprCounter = 0
  let inSingle = false
  let inDouble = false
  let inLine = false
  let inBlock = false

  const appendRaw = (oi: number) => {
    strippedChars.push(sql[oi])
    strippedToOriginal.push(oi)
    originalToStripped[oi] = strippedChars.length - 1
  }

  while (i < n) {
    const ch = sql[i]
    const nx = sql[i + 1] ?? ''

    if (inLine) {
      appendRaw(i)
      if (ch === '\n') inLine = false
      i++
      continue
    }
    if (inBlock) {
      appendRaw(i)
      if (ch === '*' && nx === '/') {
        inBlock = false
        appendRaw(i + 1)
        i += 2
        continue
      }
      i++
      continue
    }
    if (inSingle) {
      appendRaw(i)
      if (ch === "'") inSingle = false
      i++
      continue
    }
    if (inDouble) {
      appendRaw(i)
      if (ch === '"') inDouble = false
      i++
      continue
    }

    if (ch === '{' && (nx === '{' || nx === '%' || nx === '#')) {
      const kind: JinjaTagKind = nx === '{' ? 'expr' : nx === '%' ? 'stmt' : 'comment'
      const close = kind === 'expr' ? '}}' : kind === 'stmt' ? '%}' : '#}'
      const end = findTagClose(sql, i + 2, close)
      if (end < 0) {
        warnings.push(`Unterminated Jinja tag at offset ${i}`)
        while (i < n) {
          appendRaw(i)
          i++
        }
        break
      }
      const originalStart = i
      let originalEnd = end + 2
      const inner = sql.slice(i + 2, end)

      let placeholder = ''
      let controlBlock = false
      if (kind === 'expr') {
        const r = resolveExpr(inner, ++jinjaExprCounter)
        placeholder = r.placeholder
        if (r.ref) refs.push(r.ref)
        if (r.varName) vars.push(r.varName)
        if (r.note) warnings.push(r.note)
      } else if (kind === 'stmt') {
        placeholder = ''
        const t = inner.trim()
        const head = t.split(/[\s(]/)[0]?.toLowerCase() ?? ''
        if (CONTROL_OPENERS.has(head)) {
          originalEnd = findControlBlockEnd(sql, originalEnd, head)
          controlBlock = true
          warnings.push(`Jinja control block "{% ${head} %}" and its body removed; not fully compiled`)
        }
      }

      const strippedStart = strippedChars.length
      for (const pc of placeholder) {
        strippedChars.push(pc)
        strippedToOriginal.push(originalStart)
      }
      const strippedEnd = strippedChars.length
      for (let oi = originalStart; oi < originalEnd; oi++) originalToStripped[oi] = strippedStart

      regions.push({ kind, originalStart, originalEnd, strippedStart, strippedEnd, raw: sql.slice(originalStart, originalEnd), inner, placeholder, controlBlock })
      i = originalEnd
      continue
    }

    if (ch === '-' && nx === '-') {
      appendRaw(i)
      appendRaw(i + 1)
      inLine = true
      i += 2
      continue
    }
    if (ch === '/' && nx === '*') {
      appendRaw(i)
      appendRaw(i + 1)
      inBlock = true
      i += 2
      continue
    }
    if (ch === "'") {
      appendRaw(i)
      inSingle = true
      i++
      continue
    }
    if (ch === '"') {
      appendRaw(i)
      inDouble = true
      i++
      continue
    }
    appendRaw(i)
    i++
  }

  strippedToOriginal.push(n)
  originalToStripped[n] = strippedChars.length

  let last = 0
  for (let k = 0; k <= n; k++) {
    if (originalToStripped[k] === undefined) originalToStripped[k] = last
    else last = originalToStripped[k]
  }

  return {
    stripped: strippedChars.join(''),
    regions,
    refs,
    vars,
    warnings,
    strippedToOriginal,
    originalToStripped,
  }
}

export function remapToOriginal(r: StripJinjaResult, strippedOffset: number): number {
  const len = r.stripped.length
  const k = strippedOffset < 0 ? 0 : strippedOffset > len ? len : strippedOffset
  return r.strippedToOriginal[k]
}

export function remapToStripped(r: StripJinjaResult, originalOffset: number): number {
  const max = r.originalToStripped.length - 1
  const k = originalOffset < 0 ? 0 : originalOffset > max ? max : originalOffset
  return r.originalToStripped[k]
}

interface Tok {
  value: string
  start: number
  end: number
}

function tokenizeSql(s: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  const n = s.length
  while (i < n) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const start = i
    if (ch === '-' && s[i + 1] === '-') {
      i += 2
      while (i < n && s[i] !== '\n') i++
      toks.push({ value: s.slice(start, i), start, end: i })
      continue
    }
    if (ch === '#') {
      i++
      while (i < n && s[i] !== '\n') i++
      toks.push({ value: s.slice(start, i), start, end: i })
      continue
    }
    if (ch === '/' && s[i + 1] === '*') {
      i += 2
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++
      i += 2
      toks.push({ value: s.slice(start, i), start, end: i })
      continue
    }
    if (ch === "'") {
      i++
      while (i < n) {
        if (s[i] === "'" && s[i + 1] === "'") {
          i += 2
          continue
        }
        if (s[i] === "'") {
          i++
          break
        }
        i++
      }
      toks.push({ value: s.slice(start, i), start, end: i })
      continue
    }
    if (ch === '"') {
      i++
      while (i < n && s[i] !== '"') i++
      i++
      toks.push({ value: s.slice(start, i), start, end: i })
      continue
    }
    if (ch === '`') {
      i++
      while (i < n && s[i] !== '`') i++
      i++
      toks.push({ value: s.slice(start, i), start, end: i })
      continue
    }
    if (/[0-9]/.test(ch)) {
      while (i < n && /[0-9.]/.test(s[i])) i++
      toks.push({ value: s.slice(start, i), start, end: i })
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      while (i < n && /[A-Za-z0-9_]/.test(s[i])) i++
      toks.push({ value: s.slice(start, i), start, end: i })
      continue
    }
    i++
    toks.push({ value: ch, start, end: i })
  }
  return toks
}

function normToken(v: string): string {
  return /^[A-Za-z_]+$/.test(v) ? v.toLowerCase() : v
}

export function formatAroundJinja(
  sql: string,
  formatFn: (s: string) => string,
  opts?: { compact?: boolean },
): string {
  if (!hasJinja(sql)) return formatFn(sql)
  const { stripped, regions } = stripJinja(sql)
  const formatted = formatFn(stripped)
  if (!regions.length) return formatted

  const st = tokenizeSql(stripped)
  const ft = tokenizeSql(formatted)
  const aligned =
    st.length === ft.length && st.every((t, idx) => normToken(t.value) === normToken(ft[idx].value))

  if (!aligned) {
    return '-- Jinja templating detected; tags preserved in editor, showing compiled SQL:\n' + formatted
  }

  type Edit = { pos: number; removeEnd?: number; insert: string }
  const edits: Edit[] = []

  for (const r of regions) {
    if (r.controlBlock) continue
    if (r.strippedEnd > r.strippedStart) {
      const idx = st.findIndex((t) => t.start >= r.strippedStart && t.end <= r.strippedEnd)
      if (idx >= 0) {
        const f = ft[idx]
        edits.push({ pos: f.start, removeEnd: f.end, insert: r.raw })
      }
    } else {
      const idx = st.findIndex((t) => t.start >= r.strippedEnd)
      const pos = idx >= 0 ? ft[idx].start : formatted.length
      const sep = opts?.compact ? '' : '\n'
      edits.push({ pos, insert: sep + r.raw + sep })
    }
  }

  edits.sort((a, b) => b.pos - a.pos)
  let out = formatted
  for (const e of edits) {
    const before = out.slice(0, e.pos)
    const after = e.removeEnd != null ? out.slice(e.removeEnd) : out.slice(e.pos)
    out = before + e.insert + after
  }

  if (opts?.compact) {
    return out.replace(/\n{2,}/g, '\n').trim()
  }
  return out.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '\n')
}
