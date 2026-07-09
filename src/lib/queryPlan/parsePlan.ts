export interface PlanNodeData {
  id: string
  nodeType: string
  relationName?: string
  alias?: string
  startupCost: number
  totalCost: number
  planRows: number
  planWidth: number
  actualStartupTime?: number
  actualTotalTime?: number
  actualRows?: number
  actualLoops?: number
  extra: Record<string, string>
  children: PlanNodeData[]
  timeShare?: number
  nodeTime?: number
  exclusiveTime?: number
  depth: number
}

export interface PlanFinding {
  id: string
  severity: 'critical' | 'warning' | 'info'
  nodeId?: string
  title: string
  detail: string
}

export type PlanFormat = 'json' | 'text' | 'unknown'

export interface ParsedPlan {
  ok: boolean
  format: PlanFormat
  root: PlanNodeData | null
  executionTime?: number
  planningTime?: number
  findings: PlanFinding[]
  nodeCount: number
  error?: string
}

type IdGen = () => string
function makeIds(): IdGen {
  let n = 0
  return () => `pn-${++n}`
}

function num(v: unknown): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

const STANDARD_JSON_KEYS = new Set([
  'Node Type', 'Parent Relationship', 'Relation Name', 'Alias', 'Schema',
  'Startup Cost', 'Total Cost', 'Plan Rows', 'Plan Width',
  'Actual Startup Time', 'Actual Total Time', 'Actual Rows', 'Actual Loops',
  'Plans', 'Output',
])

function fromJsonNode(raw: any, depth: number, gen: IdGen): PlanNodeData {
  const extra: Record<string, string> = {}
  for (const k of Object.keys(raw)) {
    if (STANDARD_JSON_KEYS.has(k)) continue
    const v = raw[k]
    if (v == null) continue
    if (Array.isArray(v)) {
      if (v.length) extra[k] = v.map(String).join(', ')
    } else if (typeof v === 'object') {
      extra[k] = JSON.stringify(v)
    } else {
      extra[k] = String(v)
    }
  }
  const node: PlanNodeData = {
    id: gen(),
    nodeType: String(raw['Node Type'] ?? 'Unknown'),
    relationName: raw['Relation Name'] ? String(raw['Relation Name']) : undefined,
    alias: raw['Alias'] ? String(raw['Alias']) : undefined,
    startupCost: num(raw['Startup Cost']),
    totalCost: num(raw['Total Cost']),
    planRows: num(raw['Plan Rows']),
    planWidth: num(raw['Plan Width']),
    actualStartupTime: raw['Actual Startup Time'] != null ? num(raw['Actual Startup Time']) : undefined,
    actualTotalTime: raw['Actual Total Time'] != null ? num(raw['Actual Total Time']) : undefined,
    actualRows: raw['Actual Rows'] != null ? num(raw['Actual Rows']) : undefined,
    actualLoops: raw['Actual Loops'] != null ? num(raw['Actual Loops']) : undefined,
    extra,
    children: [],
    depth,
  }
  if (Array.isArray(raw['Plans'])) {
    for (const child of raw['Plans']) {
      node.children.push(fromJsonNode(child, depth + 1, gen))
    }
  }
  return node
}

function parseJsonPlan(text: string): ParsedPlan {
  const data = JSON.parse(text)
  const top = Array.isArray(data) ? data[0] : data
  if (!top || typeof top !== 'object' || !top.Plan) {
    return { ok: false, format: 'json', root: null, findings: [], nodeCount: 0, error: 'No "Plan" key found in JSON.' }
  }
  const gen = makeIds()
  const root = fromJsonNode(top.Plan, 0, gen)
  const executionTime = top['Execution Time'] != null ? num(top['Execution Time']) : undefined
  const planningTime = top['Planning Time'] != null ? num(top['Planning Time']) : undefined
  return {
    ok: true,
    format: 'json',
    root,
    executionTime,
    planningTime,
    findings: [],
    nodeCount: countNodes(root),
  }
}

const COST_RE = /\(cost=([\d.]+)\.\.([\d.]+) rows=(\d+) width=(\d+)\)/
const ACTUAL_RE = /\(actual time=([\d.]+)\.\.([\d.]+) rows=(-?\d+) loops=(\d+)\)/

function countNodes(node: PlanNodeData): number {
  let n = 1
  for (const c of node.children) n += countNodes(c)
  return n
}

function parseTextNodeType(label: string): { nodeType: string; relation?: string } {
  const onIdx = label.search(/\son\s/i)
  let head = onIdx >= 0 ? label.slice(0, onIdx) : label
  let relation = onIdx >= 0 ? label.slice(onIdx + 4).trim() : undefined
  head = head.replace(/\s+using\s.*$/i, '').trim()
  if (relation) {
    const sp = relation.indexOf(' ')
    if (sp >= 0) relation = relation.slice(0, sp)
  }
  return { nodeType: head || label, relation: relation || undefined }
}

function parseTextPlan(text: string): ParsedPlan {
  const lines = text.split(/\r?\n/)
  const gen = makeIds()
  const stack: { indent: number; node: PlanNodeData }[] = []
  let root: PlanNodeData | null = null
  let executionTime: number | undefined
  let planningTime: number | undefined

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue
    const tl = rawLine.trim()
    if (
      tl.startsWith('QUERY PLAN') ||
      /^-+$/.test(tl) ||
      /^\(\d+ rows?\)/i.test(tl)
    ) continue
    const execMatch = tl.match(/^(?:execution time|total runtime)[:\s]*([\d.]+)/i)
    if (execMatch) { executionTime = parseFloat(execMatch[1]); continue }
    const planMatch = tl.match(/^planning time[:\s]*([\d.]+)/i)
    if (planMatch) { planningTime = parseFloat(planMatch[1]); continue }

    const costMatch = rawLine.match(COST_RE)
    if (!costMatch) {
      const top = stack[stack.length - 1]
      if (top) {
        const trimmed = rawLine.trim()
        const colon = trimmed.indexOf(':')
        if (colon > 0) {
          const key = trimmed.slice(0, colon).trim()
          const val = trimmed.slice(colon + 1).trim()
          if (key && val) top.node.extra[key] = val
        }
      }
      continue
    }

    const arrowMatch = rawLine.match(/^(\s*)(?:->\s+)?(.*)$/)
    const indent = arrowMatch ? arrowMatch[1].length : 0
    let content = arrowMatch && arrowMatch[2] ? arrowMatch[2] : rawLine.trim()
    content = content.replace(COST_RE, '').replace(ACTUAL_RE, '').trim()

    const { nodeType, relation } = parseTextNodeType(content)
    const actualMatch = rawLine.match(ACTUAL_RE)
    const node: PlanNodeData = {
      id: gen(),
      nodeType,
      relationName: relation,
      startupCost: parseFloat(costMatch[1]),
      totalCost: parseFloat(costMatch[2]),
      planRows: parseInt(costMatch[3], 10),
      planWidth: parseInt(costMatch[4], 10),
      actualStartupTime: actualMatch ? parseFloat(actualMatch[1]) : undefined,
      actualTotalTime: actualMatch ? parseFloat(actualMatch[2]) : undefined,
      actualRows: actualMatch ? parseInt(actualMatch[3], 10) : undefined,
      actualLoops: actualMatch ? parseInt(actualMatch[4], 10) : undefined,
      extra: {},
      children: [],
      depth: 0,
    }

    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    if (stack.length === 0) {
      node.depth = 0
      root = node
    } else {
      const parent = stack[stack.length - 1]
      node.depth = parent.node.depth + 1
      parent.node.children.push(node)
    }
    stack.push({ indent, node })
  }

  if (!root) {
    return { ok: false, format: 'text', root: null, findings: [], nodeCount: 0, error: 'No plan nodes found. Expected lines with (cost=...).' }
  }
  return { ok: true, format: 'text', root, executionTime, planningTime, findings: [], nodeCount: countNodes(root) }
}

export function parsePlan(text: string): ParsedPlan {
  const trimmed = text.trim()
  if (!trimmed) {
    return { ok: false, format: 'unknown', root: null, findings: [], nodeCount: 0 }
  }
  let result: ParsedPlan
  if (trimmed[0] === '[' || trimmed[0] === '{') {
    try {
      result = parseJsonPlan(trimmed)
    } catch (e: any) {
      return { ok: false, format: 'json', root: null, findings: [], nodeCount: 0, error: e?.message ?? String(e) }
    }
  } else {
    result = parseTextPlan(trimmed)
  }
  if (result.ok && result.root) {
    annotateHeat(result.root, result.executionTime)
    result.findings = detectBottlenecks(result.root, result.executionTime)
  }
  return result
}

function annotateHeat(root: PlanNodeData, executionTime?: number) {
  const total = executionTime ?? root.actualTotalTime ?? 1
  const computeExclusive = (node: PlanNodeData): number => {
    const loops = node.actualLoops ?? 1
    const inclusive = node.actualTotalTime != null ? node.actualTotalTime * loops : 0
    node.nodeTime = inclusive
    let childSum = 0
    for (const c of node.children) childSum += computeExclusive(c)
    node.exclusiveTime = Math.max(0, inclusive - childSum)
    return inclusive
  }
  computeExclusive(root)
  const hasActual = root.actualTotalTime != null
  const walk = (node: PlanNodeData) => {
    node.timeShare = hasActual && node.exclusiveTime != null ? (node.exclusiveTime / total) * 100 : undefined
    node.children.forEach(walk)
  }
  walk(root)
}

function detectBottlenecks(root: PlanNodeData, executionTime?: number): PlanFinding[] {
  const findings: PlanFinding[] = []
  const total = executionTime ?? root.actualTotalTime ?? 0
  const all: PlanNodeData[] = []
  const walk = (n: PlanNodeData) => {
    all.push(n)
    n.children.forEach(walk)
  }
  walk(root)

  const withTime = all.filter((n) => n.timeShare != null).sort((a, b) => (b.timeShare ?? 0) - (a.timeShare ?? 0))
  if (withTime.length && (withTime[0].timeShare ?? 0) >= 20) {
    const n = withTime[0]
    findings.push({
      id: 'bottleneck',
      severity: 'critical',
      nodeId: n.id,
      title: 'Slowest node dominates execution',
      detail: `${label(n)} spends ${fmt(n.exclusiveTime)} ms on its own (${pct(n.timeShare)} of total) — the biggest self-time consumer.`,
    })
  }

  for (const n of all) {
    const type = n.nodeType.toLowerCase()
    if (type.includes('seq scan') && n.planRows > 10000) {
      findings.push({
        id: `seqscan-${n.id}`,
        severity: n.planRows > 100000 ? 'warning' : 'info',
        nodeId: n.id,
        title: 'Sequential scan on a large table',
        detail: `${label(n)} scans ~${fmt(n.planRows)} estimated rows. An index may turn this into a faster index scan.`,
      })
    }
    if (type.includes('nested loop') && (n.actualLoops ?? 0) > 1000) {
      findings.push({
        id: `nlloops-${n.id}`,
        severity: 'warning',
        nodeId: n.id,
        title: 'Nested Loop with high loop count',
        detail: `${label(n)} runs ${(n.actualLoops ?? 0).toLocaleString()} times — each iteration re-scans its inner child. Consider a hash or merge join.`,
      })
    }
    if (type.includes('sort')) {
      const method = n.extra['Sort Method']
      const space = n.extra['Sort Space Used']
      if ((method && /external|disk/i.test(method)) || space) {
        findings.push({
          id: `sortspill-${n.id}`,
          severity: 'warning',
          nodeId: n.id,
          title: 'Sort spilled to disk',
          detail: `${label(n)} used ${method || space + ' KB of disk'}. Increase work_mem or add a supporting index to avoid the sort.`,
        })
      } else if (n.actualRows != null && n.actualRows > 100000) {
        findings.push({
          id: `sortbig-${n.id}`,
          severity: 'info',
          nodeId: n.id,
          title: 'Large in-memory sort',
          detail: `${label(n)} sorts ~${fmt(n.actualRows)} rows. Verify work_mem is sufficient.`,
        })
      }
    }
    if (n.planRows > 0 && n.actualRows != null && n.actualRows > 0) {
      const ratio = n.actualRows / n.planRows
      if (ratio > 10 || ratio < 0.1) {
        findings.push({
          id: `stats-${n.id}`,
          severity: 'info',
          nodeId: n.id,
          title: 'Row estimate mismatch (stale stats?)',
          detail: `${label(n)} estimated ${fmt(n.planRows)} rows but got ${fmt(n.actualRows)} (${ratio > 1 ? ratio.toFixed(1) + 'x more' : (1 / ratio).toFixed(1) + 'x fewer'}). Run ANALYZE.`,
        })
      }
    }
  }

  if (total > 0 && !findings.some((f) => f.severity === 'critical')) {
    const slow = withTime[0]
    if (slow && (slow.timeShare ?? 0) > 10) {
      findings.push({
        id: 'slowest',
        severity: 'info',
        nodeId: slow.id,
        title: 'Largest time consumer',
        detail: `${label(slow)} is the biggest self-time consumer at ${pct(slow.timeShare)} (${fmt(slow.exclusiveTime)} ms).`,
      })
    }
  }

  return findings
}

function label(n: PlanNodeData): string {
  return n.relationName ? `${n.nodeType} on ${n.relationName}` : n.nodeType
}
function pct(v?: number): string {
  return v == null ? '?' : `${v.toFixed(1)}%`
}
function fmt(v?: number): string {
  if (v == null) return '?'
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K'
  return Number.isInteger(v) ? v.toString() : v.toFixed(2)
}

export function buildNarrative(plan: ParsedPlan): string[] {
  if (!plan.root) return []
  const lines: string[] = []
  if (plan.executionTime != null) {
    lines.push(`Total execution time: ${plan.executionTime.toFixed(2)} ms across ${plan.nodeCount} plan node${plan.nodeCount > 1 ? 's' : ''}.`)
  } else {
    lines.push(`Plan has ${plan.nodeCount} node${plan.nodeCount > 1 ? 's' : ''} (run EXPLAIN ANALYZE for actual timing).`)
  }

  const top = plan.findings.filter((f) => f.severity === 'critical')
  const warns = plan.findings.filter((f) => f.severity === 'warning')
  const infos = plan.findings.filter((f) => f.severity === 'info')
  if (top.length) lines.push(`Critical: ${top[0].detail}`)
  if (warns.length) lines.push(`Watch out: ${warns.map((w) => w.title.toLowerCase()).join('; ')}.`)
  if (infos.length) lines.push(`Notes: ${infos.length} informational finding${infos.length > 1 ? 's' : ''} (row-estimate mismatches, scans, sorts).`)

  const root = plan.root
  const rootLabel = label(root)
  if (root.actualTotalTime != null) {
    lines.push(`The root operation is a ${rootLabel} returning ~${fmt(root.actualRows)} row${root.actualRows === 1 ? '' : 's'}.`)
  } else {
    lines.push(`The root operation is a ${rootLabel} estimated to return ~${fmt(root.planRows)} row${root.planRows === 1 ? '' : 's'}.`)
  }

  const scans = collectScans(root)
  if (scans.length) {
    lines.push(`Data access: ${scans.map((s) => `${s.nodeType} on ${s.relationName ?? '?'}`).join(', ')}.`)
  }

  if (plan.findings.some((f) => f.id.startsWith('stats-'))) {
    lines.push(`Row-estimate mismatches suggest statistics may be stale — run ANALYZE on the affected tables.`)
  }
  return lines
}

function collectScans(node: PlanNodeData, acc: PlanNodeData[] = []): PlanNodeData[] {
  const t = node.nodeType.toLowerCase()
  if (t.includes('scan')) acc.push(node)
  node.children.forEach((c) => collectScans(c, acc))
  return acc
}
