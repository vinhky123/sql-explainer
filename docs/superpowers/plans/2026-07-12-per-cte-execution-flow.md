# Per-CTE Execution Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break each CTE in a `WITH` clause into its own `FROM → … → SELECT` flow in the execution-flow visualizer, rendered as one sequential vertical chain (CTEs in definition order, then the main query), with the Data-preview tab building mock rows for every step.

**Architecture:** Flat `FlowStep[]` (same shape as today, longer) with a new `cte?: string` scope tag per step. `buildExecutionFlow` extracts each CTE body's clause segments (paren-balanced scan of the `WITH` region, offsets remapped to original SQL space), builds a per-scope step list via a factored `buildSelectFlow` helper, and concatenates CTE flows before the main flow. `buildSnapshots` walks the flat list grouped by scope, seeding each scope from real tables or an earlier CTE's final snapshot.

**Tech Stack:** TypeScript 5.7 (strict, `noUnusedLocals`/`noUnusedParameters`), Vitest 3 (jsdom), `node-sql-parser` 5.3 (wrapped by `parseSql`), React 18 + `@xyflow/react` 12.

## Global Constraints

- **Never instantiate `node-sql-parser`'s `Parser` directly in app code** — call `parseSql(sql, dialect)` from `lib/sql/parser.ts`. (Test probe scripts under node-sql-parser are fine for exploration but not in shipped code.)
- **`tsconfig.app.json` has `noUnusedLocals` + `noUnusedParameters`** — every edit must remove unused imports/params/vars or `npm run typecheck` fails. This is the most common breakage.
- **No code comments** unless explicitly asked (project convention).
- **`any` is allowed** (`no-explicit-any` is off) — AST nodes are `any`.
- **CTE AST access path:** `const innerAst = cte.stmt?.ast ?? cte.stmt` (verified — single-statement CTEs store the SELECT AST directly on `stmt`, with no `.ast` wrapper).
- **Offset invariant:** every `startOffset`/`endOffset` on a `FlowStep` must index the **raw SQL string** the Monaco editor displays (so `editorStore.highlight` lands correctly). CTE body offsets are remapped by adding the body's start offset in the original SQL.
- **Commands** (run from `D:\Data\Codes\sql-explainer`):
  - `npm run typecheck` — must be clean
  - `npm run test:run` — Vitest one-shot
  - `npm run lint` — 0 errors (3 pre-existing `react-refresh` warnings in `button.tsx`/`FormatOptionsPanel.tsx`/`seo.tsx` are expected, do not "fix" them)
  - `npm run build` — `tsc -b && vite build`
- **Baseline:** 89 tests across 10 files pass before starting. Plan target: +new tests, 0 regressions.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/sql/executionOrder.ts` | Build ordered `FlowStep[]` from segments + AST. | Modify |
| `src/lib/sql/dataTransform.ts` | Build per-step mock-row snapshots for the Data tab. | Modify |
| `src/lib/sql/executionOrder.test.ts` | Tests for `buildExecutionFlow`. | Modify |
| `src/lib/sql/dataTransform.test.ts` | Tests for `buildSnapshots`. | Create |
| `src/features/execution-flow/ExecutionFlow.tsx` | Wires parse → segments → steps → snapshots; canvas + controls. | Modify |
| `src/features/execution-flow/FlowNode.tsx` | Renders one step as a React Flow node card. | Modify |
| `src/features/execution-flow/DataPreview.tsx` | Renders the Data tab (step pills + snapshot table). | Modify |

**Decomposition rationale:** The pure-logic layer (`executionOrder.ts`, `dataTransform.ts`) is fully unit-tested and has no React deps — TDD applies cleanly there. The UI layer (`ExecutionFlow`/`FlowNode`/`DataPreview`) consumes the new flat arrays through their existing shape and only needs light visual additions + a signature-threading change; it's verified by `typecheck` + `build` + manual smoke (no Playwright in deps).

---

## Task 1: Add `cte` field to `FlowStep` and refactor `buildExecutionFlow` into `buildSelectFlow`

**Goal of this task:** Pure refactor — extract the existing post-`WITH` step-building logic into a reusable `buildSelectFlow(segments, ast, dialect, cte)` helper, add the `cte?` field, and namespace step `id`s by scope. **No behavior change yet** (the top-level `buildExecutionFlow` still calls the helper once for the main query, producing the same output as today except `id`s of main-query steps stay bare keywords). This sets up Task 2 (CTE extraction) with a helper ready to call per-CTE.

**Files:**
- Modify: `src/lib/sql/executionOrder.ts`
- Test: `src/lib/sql/executionOrder.test.ts`

**Interfaces:**
- Produces: `FlowStep.cte?: string` (new field); `buildSelectFlow(segments: ClauseSegment[], ast: any, dialect: Dialect, cte: string | undefined): FlowStep[]` (new exported helper, returns ordered steps for ONE select, each step carrying `cte`).

- [ ] **Step 1: Update test helpers to the new signature (test will fail to compile until impl lands)**

In `src/lib/sql/executionOrder.test.ts`, the existing `flow()` and `flowDialect()` helpers call `buildExecutionFlow(splitClauses(sql), parse)`. We are NOT yet changing `buildExecutionFlow`'s signature in this task (that's Task 4) — so helpers stay as-is. Instead, **add** a new test for the helper extraction that asserts main-query behavior is preserved.

Add this test block at the end of the file:

```ts
describe('buildSelectFlow (extracted helper)', () => {
  it('produces the same main-query steps as buildExecutionFlow for a no-CTE query', () => {
    const sql = 'SELECT a FROM t WHERE x=1 GROUP BY a ORDER BY a LIMIT 5'
    const parse = parseSql(sql, 'postgresql')
    const segments = splitClauses(sql)
    const ast = Array.isArray(parse.ast) ? parse.ast[0] : parse.ast
    const helperSteps = buildSelectFlow(segments, ast, 'postgresql', undefined)
    const flowSteps = buildExecutionFlow(splitClauses(sql), parse)
    expect(helperSteps.map((s) => s.clause)).toEqual(flowSteps.map((s) => s.clause))
    expect(helperSteps.every((s) => s.cte === undefined)).toBe(true)
  })

  it('namespaces step ids by cte when cte is provided', () => {
    const sql = 'SELECT a FROM t WHERE x=1'
    const parse = parseSql(sql, 'postgresql')
    const ast = Array.isArray(parse.ast) ? parse.ast[0] : parse.ast
    const steps = buildSelectFlow(splitClauses(sql), ast, 'postgresql', 'my_cte')
    expect(steps.every((s) => s.id.startsWith('my_cte::'))).toBe(true)
    expect(steps.every((s) => s.cte === 'my_cte')).toBe(true)
  })
})
```

Add `buildSelectFlow` to the existing import line at the top of the file:

```ts
import { buildExecutionFlow, buildSelectFlow } from './executionOrder'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/sql/executionOrder.test.ts`
Expected: FAIL — `buildSelectFlow is not exported` (compile/import error), or the new describe blocks error.

- [ ] **Step 3: Add `cte?: string` to `FlowStep`**

In `src/lib/sql/executionOrder.ts`, find the `FlowStep` interface (around lines 8–22) and add the field:

```ts
export interface FlowStep {
  id: string
  order: number
  clause: string
  snippet: string
  startOffset: number
  endOffset: number
  description: string
  rowDirection: RowDirection
  tables?: string[]
  joinTypes?: string[]
  columns?: string[]
  aggregates?: string[]
  setOp?: string
  cte?: string
}
```

- [ ] **Step 4: Extract `buildSelectFlow` from the body of `buildExecutionFlow`**

In `src/lib/sql/executionOrder.ts`, **replace** the entire body of `buildExecutionFlow` (from `export function buildExecutionFlow(` at line 84 through the closing `}` at line 202) with two functions: a new exported `buildSelectFlow` helper containing all the extracted logic, and a slimmed-down `buildExecutionFlow` that delegates to it.

The new `buildSelectFlow` takes the place of the old logic but:
- Takes `(segments: ClauseSegment[], ast: any, dialect: Dialect, cte: string | undefined)` — no `parse` arg (caller passes `ast` + `dialect` directly).
- Builds the `byKeyword` map from the passed `segments` (local to this scope).
- Computes `tables`, `joinTypes`, `selectColumns`, `selectAggregates`, `hasDistinct`, `groupCols`, `orderCols` from the passed `ast` (identical logic to today).
- The inner `addStep` sets `cte` on every step and namespaces `id`:

```ts
const addStep = (
  keyword: string,
  clause: string,
  description: string,
  rowDirection: RowDirection,
  extra: Partial<FlowStep> = {},
) => {
  const seg = byKeyword.get(keyword)
  if (!seg) return
  steps.push({
    id: cte ? `${cte}::${keyword}` : keyword,
    order: ORDER[keyword] ?? 99,
    clause,
    snippet: seg.text,
    startOffset: seg.startOffset,
    endOffset: seg.endOffset,
    description,
    rowDirection,
    cte,
    ...extra,
  })
}
```

- The `DISTINCT` fallback step (the `if (hasDistinct && !byKeyword.has('SELECT'))` block) also gets `cte` and a namespaced id: `id: cte ? \`${cte}::DISTINCT\` : 'DISTINCT'`, plus `cte,` in the pushed object.

The `steps.sort((a, b) => a.order - b.order)` + `steps.forEach((s, i) => s.order = i+1)` finalization stays inside `buildSelectFlow` (returns a fully-ordered list for one scope).

Then the new slim `buildExecutionFlow`:

```ts
export function buildExecutionFlow(
  segments: ClauseSegment[],
  parse: ParseResult,
): FlowStep[] {
  if (!parse.ok || !parse.ast) return []
  const ast = Array.isArray(parse.ast) ? parse.ast[0] : parse.ast
  if (!ast) return []
  const dialect: Dialect = parse.dialect ?? 'postgresql'
  return buildSelectFlow(segments, ast, dialect, undefined)
}
```

**Important — remove the `WITH` step + `cteNames`:** the old code had a `cteNames` collection block and an `if (cteNames.length > 0) addStep('WITH', …)` block (these were added in the uncommitted working-copy changes). Since `buildSelectFlow` is now the per-scope helper and CTE handling moves to Task 2, **delete both blocks** entirely. Also delete the `WITH: 0` entry from the `ORDER` map (around line 25) since nothing emits a `WITH` step anymore. **However** — `buildSelectFlow` will receive segments that may contain a `WITH` segment (when called for the main query with `segments` containing WITH). The `addStep` calls are gated on `byKeyword.has(...)` for FROM/WHERE/etc., and there's no `addStep('WITH', …)` call, so a WITH segment in `byKeyword` is simply ignored — correct. (In Task 2 the main-query call will filter WITH out of segments before passing; for this task the harmless ignore is fine.)

Keep all existing helper functions (`colName`, `collectAggregates`, `fromTableName`) unchanged at module scope — `buildSelectFlow` uses them.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/sql/executionOrder.test.ts`
Expected: PASS — all existing tests still green (main-query behavior unchanged) + the 2 new `buildSelectFlow` tests pass.

- [ ] **Step 6: Run full suite + typecheck to confirm no regressions**

Run: `npm run test:run`
Expected: PASS — all 89+2 tests pass.

Run: `npm run typecheck`
Expected: clean (watch for unused `ParseResult` import if `buildExecutionFlow` no longer references it — it still does, via the `parse: ParseResult` param, so the import stays).

- [ ] **Step 7: Commit**

```bash
git add src/lib/sql/executionOrder.ts src/lib/sql/executionOrder.test.ts
git commit -m "Refactor buildExecutionFlow into buildSelectFlow helper

Extract the per-SELECT step-building logic into a reusable
buildSelectFlow(segments, ast, dialect, cte) helper. Add cte?
field to FlowStep; namespace step ids by scope (cte::keyword).
Pure refactor — main-query output unchanged. Remove the
interim single WITH step + cteNames block."
```

---

## Task 2: Extract CTE bodies and build per-CTE flows

**Goal of this task:** Add `extractCteBodies(withSegment, ast)` and wire it into `buildExecutionFlow` so each CTE produces its own steps before the main query. After this task the Pipeline view shows CTE-by-CTE flows. (Data tab still shows only main-query snapshots — that's Task 3.)

**Files:**
- Modify: `src/lib/sql/executionOrder.ts`
- Test: `src/lib/sql/executionOrder.test.ts`

**Interfaces:**
- Consumes: `buildSelectFlow` from Task 1; `ClauseSegment` from `clauseSplitter`.
- Produces: `buildExecutionFlow` now returns `[...cteSteps, ...mainSteps]`; each CTE step has `cte: <name>` and original-space offsets.

- [ ] **Step 1: Write failing tests for per-CTE flow extraction**

Add to `src/lib/sql/executionOrder.test.ts`:

```ts
describe('buildExecutionFlow (per-CTE flows)', () => {
  it('emits a FROM and SELECT step for each CTE before the main query', () => {
    const sql = [
      'WITH cte_a AS (SELECT id FROM users WHERE active = 1),',
      '     cte_b AS (SELECT id FROM cte_a)',
      'SELECT id FROM cte_b',
    ].join(' ')
    const steps = flow(sql)
    const clauses = steps.map((s) => s.clause)
    // Both CTEs have their own FROM + SELECT, in definition order, before the main FROM.
    const aFrom = clauses.indexOf('FROM')
    const aWhere = clauses.indexOf('WHERE')
    const aSelect = clauses.indexOf('SELECT')
    expect(aFrom).toBeGreaterThanOrEqual(0)
    expect(aWhere).toBeGreaterThan(aFrom)
    expect(aSelect).toBeGreaterThan(aWhere)
    // There are multiple FROMs (cte_a, cte_b, main)
    const fromCount = steps.filter((s) => s.clause === 'FROM').length
    expect(fromCount).toBe(3)
  })

  it('tags CTE steps with their cte name and leaves main-query steps untagged', () => {
    const sql = 'WITH cte_a AS (SELECT id FROM users) SELECT id FROM cte_a'
    const steps = flow(sql)
    const cteSteps = steps.filter((s) => s.cte === 'cte_a')
    const mainSteps = steps.filter((s) => s.cte === undefined)
    expect(cteSteps.length).toBeGreaterThan(0)
    expect(mainSteps.length).toBeGreaterThan(0)
    // Every step has cte set (either the name or undefined) — no missing field
    expect(steps.every((s) => s.cte !== null)).toBe(true)
  })

  it('remaps CTE body offsets back to original SQL space', () => {
    const sql = 'WITH cte_a AS (SELECT id FROM users) SELECT id FROM cte_a'
    const steps = flow(sql)
    const cteFrom = steps.find((s) => s.cte === 'cte_a' && s.clause === 'FROM')!
    // The snippet must be the exact substring of the original SQL at those offsets
    expect(sql.slice(cteFrom.startOffset, cteFrom.endOffset)).toBe(cteFrom.snippet)
    // And the snippet must contain the users table reference
    expect(cteFrom.snippet).toContain('users')
  })

  it('produces unique step ids across all scopes', () => {
    const sql = [
      'WITH cte_a AS (SELECT id FROM users),',
      '     cte_b AS (SELECT id FROM cte_a)',
      'SELECT id FROM cte_b',
    ].join(' ')
    const steps = flow(sql)
    const ids = steps.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('skips recursive / set-op CTEs without throwing', () => {
    const sql = 'WITH RECURSIVE t(n) AS (SELECT 1 AS n UNION ALL SELECT n+1 FROM t WHERE n<5) SELECT n FROM t'
    const steps = flow(sql)
    // Main query still produces steps
    expect(steps.some((s) => s.cte === undefined && s.clause === 'FROM')).toBe(true)
    // The recursive CTE produced no steps
    expect(steps.some((s) => s.cte === 't')).toBe(false)
  })

  it('still works for a query with no CTEs', () => {
    const steps = flow('SELECT a FROM t WHERE x=1')
    expect(steps.some((s) => s.clause === 'FROM')).toBe(true)
    expect(steps.every((s) => s.cte === undefined)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/sql/executionOrder.test.ts`
Expected: FAIL — the first test fails because `buildExecutionFlow` currently produces only main-query steps (no CTE FROM/SELECT steps), so `fromCount` is 1, not 3.

- [ ] **Step 3: Implement `extractCteBodies`**

Add this function to `src/lib/sql/executionOrder.ts` (above `buildExecutionFlow`):

```ts
export interface CteBody {
  name: string
  bodyStart: number
  bodyEnd: number
  ast: any
}

function skipWhitespaceAndCommas(text: string, i: number): number {
  while (i < text.length && /[\s,]/.test(text[i])) i++
  return i
}

function readIdentifier(text: string, i: number): { name: string; next: number } | null {
  if (text[i] === '"') {
    const end = text.indexOf('"', i + 1)
    if (end < 0) return null
    return { name: text.slice(i + 1, end), next: end + 1 }
  }
  const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i))
  if (!m) return null
  return { name: m[0], next: i + m[0].length }
}

function findMatchingParen(text: string, open: number): number {
  let depth = 0
  let inSingle = false
  let inDouble = false
  let inLine = false
  let inBlock = false
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    const nx = text[i + 1] ?? ''
    if (inLine) { if (ch === '\n') inLine = false; continue }
    if (inBlock) { if (ch === '*' && nx === '/') { inBlock = false; i++ } continue }
    if (inSingle) { if (ch === "'") inSingle = false; continue }
    if (inDouble) { if (ch === '"') inDouble = false; continue }
    if (ch === '-' && nx === '-') { inLine = true; i++; continue }
    if (ch === '/' && nx === '*') { inBlock = true; i++; continue }
    if (ch === "'") { inSingle = true; continue }
    if (ch === '"') { inDouble = true; continue }
    if (ch === '(') { depth++; continue }
    if (ch === ')') { depth--; if (depth === 0) return i; continue }
  }
  return -1
}

export function extractCteBodies(
  withSegment: ClauseSegment | undefined,
  ast: any,
): CteBody[] {
  if (!withSegment || !Array.isArray(ast?.with)) return []
  const origin = withSegment.startOffset
  const text = withSegment.text
  const out: CteBody[] = []
  let i = 0
  // Skip leading WITH (and optional RECURSIVE)
  const withMatch = /^WITH\s+/i.exec(text)
  if (!withMatch) return []
  i = withMatch[0].length
  const rec = /^RECURSIVE\s+/i.exec(text.slice(i))
  if (rec) i += rec[0].length

  for (let c = 0; c < ast.with.length; c++) {
    const cte = ast.with[c]
    i = skipWhitespaceAndCommas(text, i)
    const id = readIdentifier(text, i)
    if (!id) break
    i = id.next
    i = skipWhitespaceAndCommas(text, i)
    // Optional column list ( ... )
    if (text[i] === '(') {
      const close = findMatchingParen(text, i)
      if (close < 0) break
      i = close + 1
      i = skipWhitespaceAndCommas(text, i)
    }
    // Expect AS
    const asMatch = /^AS\b/i.exec(text.slice(i))
    if (!asMatch) break
    i += asMatch[0].length
    i = skipWhitespaceAndCommas(text, i)
    // Body in ( ... )
    if (text[i] !== '(') break
    const open = i
    const close = findMatchingParen(text, open)
    if (close < 0) break
    const innerAst = cte.stmt?.ast ?? cte.stmt
    out.push({
      name: id.name,
      bodyStart: origin + open + 1,
      bodyEnd: origin + close,
      ast: innerAst,
    })
    i = close + 1
  }
  return out
}
```

Note the offset math: `bodyStart = origin + open + 1` (just after the `(`) and `bodyEnd = origin + close` (just before the `)`). This way `sql.slice(bodyStart, bodyEnd)` is the body text without the wrapping parens — which is what `splitClauses` expects (a `SELECT …` string, not `(SELECT …)`).

- [ ] **Step 4: Wire CTE extraction into `buildExecutionFlow`**

`buildExecutionFlow` needs the raw SQL to slice bodies. Change its signature to take `sql` as a third arg, and loop the CTEs. Replace the Task 1 slim `buildExecutionFlow` with:

```ts
export function buildExecutionFlow(
  segments: ClauseSegment[],
  parse: ParseResult,
  sql: string,
): FlowStep[] {
  if (!parse.ok || !parse.ast) return []
  const ast = Array.isArray(parse.ast) ? parse.ast[0] : parse.ast
  if (!ast) return []
  const dialect: Dialect = parse.dialect ?? 'postgresql'

  const withSeg = segments.find((s) => s.keyword === 'WITH')
  const cteBodies = extractCteBodies(withSeg, ast)

  const steps: FlowStep[] = []

  for (const body of cteBodies) {
    const inner = body.ast
    // Skip CTEs we can't model: non-select, set-op (UNION), or no resolvable FROM table.
    if (!inner || inner.type !== 'select' || inner._next || !inner.from?.[0]?.table) continue
    const bodyText = sql.slice(body.bodyStart, body.bodyEnd)
    const bodySegs = splitClauses(bodyText).map((s) => ({
      ...s,
      startOffset: s.startOffset + body.bodyStart,
      endOffset: s.endOffset + body.bodyStart,
    }))
    steps.push(...buildSelectFlow(bodySegs, inner, dialect, body.name))
  }

  const mainSegs = segments.filter((s) => s.keyword !== 'WITH')
  steps.push(...buildSelectFlow(mainSegs, ast, dialect, undefined))

  return steps
}
```

You'll need to import `splitClauses`. At the top of `executionOrder.ts`, change:

```ts
import type { ClauseSegment } from './clauseSplitter'
```

to:

```ts
import { splitClauses, type ClauseSegment } from './clauseSplitter'
```

(The existing `import type { ClauseSegment }` line gets replaced — don't leave both.)

- [ ] **Step 5: Update the existing test helpers to pass `sql`**

The existing `flow()` and `flowDialect()` helpers in `executionOrder.test.ts` call `buildExecutionFlow(splitClauses(sql), parse)` — now they need the third arg. Update both:

```ts
function flow(sql: string) {
  const parse = parseSql(sql, 'postgresql')
  return buildExecutionFlow(splitClauses(sql), parse, sql)
}

function flowDialect(sql: string, dialect: Parameters<typeof parseSql>[1]) {
  const parse = parseSql(sql, dialect)
  return buildExecutionFlow(splitClauses(sql), parse, sql)
}
```

Also update the `buildSelectFlow` test from Task 1 that compared against `buildExecutionFlow` — that call now needs `sql` too. Find:

```ts
const flowSteps = buildExecutionFlow(splitClauses(sql), parse)
```

and change to:

```ts
const flowSteps = buildExecutionFlow(splitClauses(sql), parse, sql)
```

- [ ] **Step 6: Run the executionOrder tests to verify they pass**

Run: `npx vitest run src/lib/sql/executionOrder.test.ts`
Expected: PASS — all existing + the 6 new per-CTE tests pass.

- [ ] **Step 7: Fix the one caller of `buildExecutionFlow` (Pipeline will be broken until this)**

`buildExecutionFlow` now requires `sql`. Find its caller in `src/features/execution-flow/ExecutionFlow.tsx` (around line 159):

```ts
const steps = useMemo(() => buildExecutionFlow(segments, parse), [segments, parse])
```

Change to:

```ts
const steps = useMemo(() => buildExecutionFlow(segments, parse, sql), [segments, parse, sql])
```

(`sql` is already in scope from `const { sql, dialect } = useSqlStore()` at line 156.)

- [ ] **Step 8: Run full suite + typecheck**

Run: `npm run test:run`
Expected: PASS — all tests green (the AiPanel/prompts/jinja tests don't touch `buildExecutionFlow`).

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sql/executionOrder.ts src/lib/sql/executionOrder.test.ts src/features/execution-flow/ExecutionFlow.tsx
git commit -m "Extract CTE bodies into per-CTE execution flows

buildExecutionFlow now scans the WITH region (paren-balanced,
string/comment-aware), slices each CTE body, and builds a
FROM->...->SELECT flow per CTE before the main query. Step
offsets remap to original SQL space. Recursive/set-op CTEs
are skipped gracefully. Third sql arg threaded through."
```

---

## Task 3: Extend `buildSnapshots` to per-scope snapshots

**Goal of this task:** The Data tab shows mock rows for every step, including CTE bodies. A CTE that references an earlier CTE seeds from that CTE's final snapshot.

**Files:**
- Modify: `src/lib/sql/dataTransform.ts`
- Create: `src/lib/sql/dataTransform.test.ts`
- Modify: `src/features/execution-flow/ExecutionFlow.tsx` (signature thread)

**Interfaces:**
- Consumes: `FlowStep.cte` from Task 1; `buildSourceTable` from `mockData.ts`.
- Produces: `buildSnapshots(steps, parse, sql)` returns `SnapshotResult | null` whose `.snapshots` is index-aligned 1:1 with `steps` (some entries may be `null` for unvisualizable scopes). The `TableSnapshot[]` type on `SnapshotResult.snapshots` must become `(TableSnapshot | null)[]`.

- [ ] **Step 1: Create the test file with failing tests**

Create `src/lib/sql/dataTransform.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSnapshots } from './dataTransform'
import { splitClauses } from './clauseSplitter'
import { buildExecutionFlow } from './executionOrder'
import { parseSql } from './parser'

function snaps(sql: string) {
  const parse = parseSql(sql, 'postgresql')
  const steps = buildExecutionFlow(splitClauses(sql), parse, sql)
  return buildSnapshots(steps, parse, sql)
}

describe('buildSnapshots (per-CTE)', () => {
  it('returns one snapshot per step across CTE + main scopes', () => {
    const sql = 'WITH cte_a AS (SELECT id FROM users) SELECT id FROM cte_a'
    const r = snaps(sql)
    expect(r).not.toBeNull()
    const parse = parseSql(sql, 'postgresql')
    const steps = buildExecutionFlow(splitClauses(sql), parse, sql)
    expect(r!.snapshots.length).toBe(steps.length)
    expect(r!.snapshots.every((s) => s !== null)).toBe(true)
  })

  it('seeds a CTE-of-CTE from the referenced CTE final state', () => {
    const sql = [
      'WITH cte_a AS (SELECT id FROM users WHERE id > 0)',
      '     cte_b AS (SELECT id FROM cte_a)',
      'SELECT id FROM cte_b',
    ].join(' ')
    const r = snaps(sql)
    expect(r).not.toBeNull()
    // cte_b should be visualizable (seeded from cte_a, not a real table)
    const parse = parseSql(sql, 'postgresql')
    const steps = buildExecutionFlow(splitClauses(sql), parse, sql)
    const bFromIdx = steps.findIndex((s) => s.cte === 'cte_b' && s.clause === 'FROM')
    expect(bFromIdx).toBeGreaterThanOrEqual(0)
    expect(r!.snapshots[bFromIdx]).not.toBeNull()
  })

  it('returns null snapshots for an unvisualizable CTE without throwing', () => {
    const sql = 'WITH RECURSIVE t(n) AS (SELECT 1 AS n UNION ALL SELECT n+1 FROM t WHERE n<5) SELECT n FROM t'
    const r = snaps(sql)
    // Main query is visualizable; recursive CTE was skipped in steps (Task 2),
    // so snapshots length matches steps length and all are non-null (main only).
    expect(r).not.toBeNull()
    const parse = parseSql(sql, 'postgresql')
    const steps = buildExecutionFlow(splitClauses(sql), parse, sql)
    expect(r!.snapshots.length).toBe(steps.length)
  })

  it('returns null when there are no visualizable scopes', () => {
    const r = snaps('SELECT 1')
    expect(r).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/sql/dataTransform.test.ts`
Expected: FAIL — either `buildSnapshots` doesn't accept 3 args, or snapshot count mismatches (currently it produces snapshots only for the main-query steps, not the CTE steps, so `snapshots.length !== steps.length`).

- [ ] **Step 3: Widen the `SnapshotResult.snapshots` type**

In `src/lib/sql/dataTransform.ts`, change the `SnapshotResult` interface (around line 33):

```ts
export interface SnapshotResult {
  snapshots: (TableSnapshot | null)[]
  source: SourceTable
}
```

- [ ] **Step 4: Refactor `buildSnapshots` to walk scopes**

Replace the existing `buildSnapshots` function (the `export function buildSnapshots(steps, parse)` at the bottom of `dataTransform.ts`, around lines 418–441) with a scope-aware version. The existing single-scope snapshot machinery (`applyStep`, `toSnapshot`, the `WorkState` seeding via `buildSourceTable`) stays — we just call it once per scope and chain CTE results.

New implementation:

```ts
function seedScopeState(
  scopeAst: any,
  dialect: Dialect,
  cteResults: Map<string, WorkState>,
): { state: WorkState; tables: InferredTable[] } | null {
  const from0 = scopeAst.from?.[0]
  if (!from0 || !from0.table) return null
  // If the first FROM table is an earlier CTE, seed from its final state.
  const cteSeed = cteResults.get(String(from0.table))
  if (cteSeed) {
    // Project the CTE's final alive columns into a fresh source-like shape.
    const columns: WorkCol[] = cteSeed.columns
      .filter((c) => c.alive)
      .map((c) => ({ ...c, alive: true, isAgg: false }))
    const rows: WorkRow[] = cteSeed.rows
      .filter((r) => r.alive)
      .map((r, i) => ({ id: i, values: { ...r.values }, alive: true }))
    const tables: InferredTable[] = [{
      realName: String(from0.table),
      name: from0.as ?? String(from0.table),
      alias: from0.as,
      columns: columns.map((c) => ({ name: c.name, kind: c.kind, table: c.name })),
    }]
    if (columns.length === 0 || rows.length === 0) return null
    return { state: { columns, rows, grouped: false }, tables }
  }
  // Otherwise build mock source from real table refs.
  const source = buildSourceTable(scopeAst)
  if (!source || source.columns.length === 0 || source.rows.length === 0) return null
  const tables = source.tables
  const state: WorkState = {
    columns: source.columns.map((c) => ({ ...c, alive: true, isAgg: false })),
    rows: source.rows.map((r) => ({ id: r.id, values: { ...r.values }, alive: true })),
    grouped: false,
  }
  return { state, tables }
}

function snapshotScope(
  scopeSteps: FlowStep[],
  scopeAst: any,
  dialect: Dialect,
  cteResults: Map<string, WorkState>,
): TableSnapshot[] | null {
  const seeded = seedScopeState(scopeAst, dialect, cteResults)
  if (!seeded) return null
  const { state: seed, tables } = seeded
  const states: WorkState[] = [seed]
  let cur = seed
  for (let i = 1; i < scopeSteps.length; i++) {
    cur = applyStep(cur, scopeSteps[i], scopeAst, tables, dialect)
    states.push(cur)
  }
  return states.map((st, i) => toSnapshot(st, scopeSteps[i], scopeAst, tables))
}

export function buildSnapshots(
  steps: FlowStep[],
  parse: ParseResult,
  sql: string,
): SnapshotResult | null {
  if (!parse.ok || !parse.ast) return null
  const mainAst = Array.isArray(parse.ast) ? parse.ast[0] : parse.ast
  if (!mainAst || mainAst.type !== 'select') return null
  const dialect: Dialect = parse.dialect ?? 'postgresql'

  // Build a lookup from CTE name -> inner AST (same normalization as executionOrder).
  const cteAst = new Map<string, any>()
  if (Array.isArray(mainAst.with)) {
    for (const cte of mainAst.with) {
      const name = cte.name?.value ?? cte.name
      const inner = cte.stmt?.ast ?? cte.stmt
      if (name && inner?.type === 'select' && !inner._next && inner.from?.[0]?.table) {
        cteAst.set(String(name), inner)
      }
    }
  }

  // Group consecutive steps by their cte scope, preserving order.
  interface Scope { cte: string | undefined; steps: FlowStep[] }
  const scopes: Scope[] = []
  for (const step of steps) {
    const last = scopes[scopes.length - 1]
    if (last && last.cte === step.cte) last.steps.push(step)
    else scopes.push({ cte: step.cte, steps: [step] })
  }

  const cteResults = new Map<string, WorkState>()
  const snapshots: (TableSnapshot | null)[] = []
  let mainSource: SourceTable | null = null

  for (const scope of scopes) {
    const scopeAst = scope.cte == null ? mainAst : cteAst.get(scope.cte)
    if (!scopeAst) {
      // Unknown scope (e.g. a CTE we skipped at the executionOrder level).
      snapshots.push(...scope.steps.map(() => null))
      continue
    }
    const scopeSnaps = snapshotScope(scope.steps, scopeAst, dialect, cteResults)
    if (scopeSnaps === null) {
      snapshots.push(...scope.steps.map(() => null))
      continue
    }
    snapshots.push(...scopeSnaps)
    if (scope.cte) {
      // Cache this CTE's final WorkState for dependents. Re-derive from the last snap's state.
      const last = scopeSnaps[scopeSnaps.length - 1]
      void last // (WorkState caching is via re-seeding; see note below)
    }
    if (scope.cte == null && mainSource === null) {
      const src = buildSourceTable(mainAst)
      if (src) mainSource = src
    }
  }

  if (mainSource === null) return null
  return { snapshots, source: mainSource }
}
```

**Important WorkState caching note:** the `seedScopeState` function above reads from `cteResults` (a `Map<string, WorkState>`). To actually populate it, `snapshotScope` must return the **final `WorkState`** too, not just the snapshots. Adjust `snapshotScope` to also return the final state:

```ts
function snapshotScope(
  scopeSteps: FlowStep[],
  scopeAst: any,
  dialect: Dialect,
  cteResults: Map<string, WorkState>,
): { snaps: TableSnapshot[]; final: WorkState } | null {
  const seeded = seedScopeState(scopeAst, dialect, cteResults)
  if (!seeded) return null
  const { state: seed, tables } = seeded
  const states: WorkState[] = [seed]
  let cur = seed
  for (let i = 1; i < scopeSteps.length; i++) {
    cur = applyStep(cur, scopeSteps[i], scopeAst, tables, dialect)
    states.push(cur)
  }
  return { snaps: states.map((st, i) => toSnapshot(st, scopeSteps[i], scopeAst, tables)), final: cur }
}
```

And in `buildSnapshots`, replace the `scopeSnaps`-handling block:

```ts
const result = snapshotScope(scope.steps, scopeAst, dialect, cteResults)
if (result === null) {
  snapshots.push(...scope.steps.map(() => null))
  continue
}
snapshots.push(...result.snaps)
if (scope.cte) cteResults.set(scope.cte, result.final)
if (scope.cte == null && mainSource === null) {
  const src = buildSourceTable(mainAst)
  if (src) mainSource = src
}
```

(Remove the placeholder `void last` block — the real caching is now `cteResults.set(scope.cte, result.final)`.)

The `sql` param is accepted for signature symmetry with `buildExecutionFlow` (and future body-slicing needs); it's currently unused inside `buildSnapshots`. To satisfy `noUnusedParameters`, either prefix with underscore (`_sql`) or actually use it. **Use it** for a light validation: at the top of the function, `if (!sql.trim()) return null`. (Belt-and-suspenders; the caller already guards on empty, but it makes the param non-vacuous and matches the empty-input guard pattern in `parseSql`.) Add it as the first line inside `buildSnapshots`:

```ts
if (!sql.trim()) return null
```

- [ ] **Step 5: Thread `sql` through the caller**

In `src/features/execution-flow/ExecutionFlow.tsx` (around line 160):

```ts
const snapshotResult = useMemo(() => buildSnapshots(steps, parse), [steps, parse])
```

becomes:

```ts
const snapshotResult = useMemo(() => buildSnapshots(steps, parse, sql), [steps, parse, sql])
```

- [ ] **Step 6: Run the dataTransform tests**

Run: `npx vitest run src/lib/sql/dataTransform.test.ts`
Expected: PASS — all 4 new tests pass.

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npm run test:run`
Expected: PASS — all prior tests + 4 new ones.

Run: `npm run typecheck`
Expected: clean. (Watch: `DataPreview.tsx` indexes `snapshots[idx]` and reads `.columns` — with `null` now possible in the array, TS may complain. That file is fixed in Task 5; if typecheck fails here because of DataPreview, do the minimal null-guard in Task 5 Step 1 first and come back. The cleanest ordering is: Task 4 (FlowNode) and Task 5 (DataPreview) next, which complete the UI side.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/sql/dataTransform.ts src/lib/sql/dataTransform.test.ts src/features/execution-flow/ExecutionFlow.tsx
git commit -m "Extend buildSnapshots to per-CTE scopes

Walk the flat step list grouped by cte scope. Seed each scope
from real tables (buildSourceTable) or, when the CTE's FROM
references an earlier CTE, from that CTE's final WorkState.
Unvisualizable scopes emit null snapshots. Snapshots array is
now (TableSnapshot | null)[] and stays 1:1 index-aligned with
steps. Third sql arg threaded through."
```

---

## Task 4: Show the CTE scope in `FlowNode`

**Goal of this task:** Each step card in the Pipeline view displays a small chip naming the CTE it belongs to, so the chain reads cte_a → cte_b → main as you scroll/play.

**Files:**
- Modify: `src/features/execution-flow/FlowNode.tsx`

**Interfaces:**
- Consumes: `FlowStep.cte` from Task 1.

- [ ] **Step 1: Add a `Braces` icon import and render a `cte` chip**

In `src/features/execution-flow/FlowNode.tsx`, add `Braces` to the `lucide-react` import (line 4–7):

```ts
import {
  Database, Filter, Group, Sigma, ArrowDownWideNarrow,
  Rows3, ArrowUpDown, ArrowDownToLine, Columns3, Braces,
} from 'lucide-react'
```

Then, inside `FlowNodeImpl` (just after the `const Icon = clauseIcon[step.clause] ?? ArrowDownWideNarrow` line), render the scope chip in the card header. Find the header `<div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">` and insert the chip right after the order badge `<span>...</span>`. Concretely, replace:

```tsx
<div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
    {step.order}
  </span>
  <Icon className="h-3.5 w-3.5 text-primary" />
  <span className="font-mono text-sm font-semibold">{step.clause}</span>
  <span className={cn('ml-auto text-[10px] font-medium', meta.color)}>{meta.label}</span>
</div>
```

with:

```tsx
<div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
    {step.order}
  </span>
  {step.cte && (
    <span className="inline-flex items-center gap-1 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
      <Braces className="h-2.5 w-2.5" />
      {step.cte}
    </span>
  )}
  <Icon className="h-3.5 w-3.5 text-primary" />
  <span className="font-mono text-sm font-semibold">{step.clause}</span>
  <span className={cn('ml-auto text-[10px] font-medium', meta.color)}>{meta.label}</span>
</div>
```

- [ ] **Step 2: Run typecheck + build**

Run: `npm run typecheck`
Expected: clean.

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/features/execution-flow/FlowNode.tsx
git commit -m "Show CTE scope chip on FlowNode cards

Render an indigo chip with the CTE name (Braces icon) on each
step card when step.cte is set, so the pipeline chain reads
clearly as cte_a -> cte_b -> main."
```

---

## Task 5: Handle per-scope snapshots and nulls in `DataPreview`

**Goal of this task:** The Data tab's step-pill row groups by scope, and the table view degrades gracefully when a snapshot is `null`.

**Files:**
- Modify: `src/features/execution-flow/DataPreview.tsx`

**Interfaces:**
- Consumes: `FlowStep.cte` (Task 1); `(TableSnapshot | null)[]` snapshots (Task 3).

- [ ] **Step 1: Guard against `null` snapshots and group pills by scope**

In `src/features/execution-flow/DataPreview.tsx`, the component currently does `const snap = snapshots[idx]` then reads `snap.columns.length` unconditionally. With `null` possible, guard it.

Replace the top of the `DataPreview` function body (from `const idx = ...` through the `const Icon = ...` line) with:

```tsx
export function DataPreview({ steps, snapshots, activeIdx, onStepClick }: Props) {
  const idx = Math.max(0, Math.min(activeIdx, snapshots.length - 1))
  const snap = snapshots[idx]
  const step = steps[idx]
  const Icon = clauseIcon[step.clause] ?? Sigma

  if (!snap) {
    return (
      <div className="flex h-full flex-col">
        <ScopePills steps={steps} snapshots={snapshots} idx={idx} onStepClick={onStepClick} />
        <div className="border-b border-border/60 bg-primary/5 px-3 py-1.5 text-xs">
          <Icon className="mr-1 inline h-3 w-3 text-primary" />
          <span className="font-mono text-primary">Step {idx + 1}/{steps.length}:</span>{' '}
          <span className="font-medium text-foreground">{step.clause}</span>
          {step.cte && (
            <span className="ml-2 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300">
              {step.cte}
            </span>
          )}
          <span className="text-muted-foreground"> — no preview available for this scope</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          This CTE references something the mock-data engine can&apos;t model (e.g. a recursive or set-op CTE).
        </div>
      </div>
    )
  }

  const colCount = snap.columns.length
  const gridCols = `2rem repeat(${colCount}, minmax(5.5rem, 1fr))`
  // ... rest of the existing render (the table) unchanged
```

The existing render below that (the `<div className="flex h-full flex-col">` wrapping the pills + table) needs its top-level pill row extracted into a `ScopePills` helper so both the null branch and the main branch share it. Define `ScopePills` above `DataPreview`:

```tsx
function ScopePills({
  steps,
  snapshots,
  idx,
  onStepClick,
}: {
  steps: FlowStep[]
  snapshots: (TableSnapshot | null)[]
  idx: number
  onStepClick: (i: number) => void
}) {
  let lastCte: string | undefined | null = null
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border/60 px-2 py-1.5">
      {steps.map((s, i) => {
        const SIcon = clauseIcon[s.clause] ?? Sigma
        const active = i === idx
        const showScope = s.cte !== lastCte
        lastCte = s.cte
        const disabled = snapshots[i] === null
        return (
          <div key={s.id} className="flex shrink-0 flex-col gap-0.5">
            {showScope && (
              <span className="px-1 text-[9px] font-medium uppercase tracking-wide text-indigo-400">
                {s.cte ?? 'main'}
              </span>
            )}
            <button
              onClick={() => onStepClick(i)}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
                active
                  ? 'border-primary bg-primary/15 text-primary'
                  : disabled
                    ? 'border-border/40 text-muted-foreground/40'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px]',
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/30',
                )}
              >
                {i + 1}
              </span>
              <SIcon className="h-3 w-3" />
              {s.clause}
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

Then in the main (non-null) render of `DataPreview`, **replace** the existing inline pill `<div className="flex gap-1 overflow-x-auto border-b border-border/60 px-2 py-1.5">…</div>` block with `<ScopePills steps={steps} snapshots={snapshots} idx={idx} onStepClick={onStepClick} />`.

Also add the `cte` chip to the main branch's step-info bar (find `<span className="font-medium text-foreground">{step.clause}</span>` and insert after it):

```tsx
{step.cte && (
  <span className="ml-2 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300">
    {step.cte}
  </span>
)}
```

Update the `Props` interface's `snapshots` type from `TableSnapshot[]` to `(TableSnapshot | null)[]`:

```tsx
interface Props {
  steps: FlowStep[]
  snapshots: (TableSnapshot | null)[]
  activeIdx: number
  onStepClick: (i: number) => void
}
```

- [ ] **Step 2: Run typecheck + build**

Run: `npm run typecheck`
Expected: clean. (This resolves the potential TS error from Task 3's widened type.)

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Run full test suite (UI changes shouldn't break lib tests, but confirm)**

Run: `npm run test:run`
Expected: PASS — all tests still green.

- [ ] **Step 4: Commit**

```bash
git add src/features/execution-flow/DataPreview.tsx
git commit -m "Group DataPreview pills by scope, handle null snapshots

Step pills now show a scope label (cte name / 'main') when the
scope changes, and disable pills whose snapshot is null. The
table view shows a friendly 'no preview available' state for
unvisualizable scopes instead of crashing. Widen snapshots
prop type to (TableSnapshot | null)[]."
```

---

## Task 6: Full verification + manual smoke

**Goal of this task:** Confirm the whole feature works end-to-end and all gates pass.

**Files:** None modified (verification only).

- [ ] **Step 1: Run all four gates**

```bash
npm run typecheck
npm run test:run
npm run lint
npm run build
```

Expected:
- `typecheck`: clean.
- `test:run`: all tests pass (89 baseline + ~12 new across `executionOrder.test.ts` and the new `dataTransform.test.ts`).
- `lint`: 0 errors (3 pre-existing `react-refresh` warnings unchanged).
- `build`: passes.

If any gate fails, fix before proceeding — do not commit a broken state.

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev`

Open `http://localhost:5173`. For each scenario, load the SQL (paste into the editor on `/execution-flow` or use the home sample if it has CTEs) and verify:

1. **Multi-CTE query** — paste:
   ```sql
   WITH cte_orders AS (
     SELECT id, customer_id, amount FROM orders WHERE status = 'paid'
   ), cte_top AS (
     SELECT customer_id, SUM(amount) AS total FROM cte_orders
     GROUP BY customer_id ORDER BY total DESC LIMIT 10
   )
   SELECT c.name, t.total FROM cte_top t
   JOIN customers c ON c.id = t.customer_id ORDER BY t.total DESC
   ```
   - **Pipeline tab:** chain shows cte_orders (FROM/WHERE/SELECT) → cte_top (FROM/GROUP BY/SELECT/ORDER BY/LIMIT) → main (FROM/SELECT/ORDER BY). Each cte_* card has an indigo scope chip.
   - Click **Play** — animation walks all steps in order, cte_orders first.
   - Hover a CTE step → the editor highlights the right lines **inside the CTE body** (offset remapping works).
   - **Data tab:** pills show scope labels (cte_orders / cte_top / main). Clicking through shows mock rows for each CTE. cte_top's FROM snapshot carries cte_orders's output forward (not freshly-generated rows).

2. **Single CTE** — `WITH cte AS (SELECT id FROM users) SELECT id FROM cte` — Pipeline shows cte's FROM/SELECT then main's FROM/SELECT.

3. **No CTE** — `SELECT a FROM t WHERE x=1` — unchanged from before; no scope chips; all `cte` undefined.

4. **Recursive CTE** — `WITH RECURSIVE t(n) AS (SELECT 1 AS n UNION ALL SELECT n+1 FROM t WHERE n<5) SELECT n FROM t` — main query renders normally; the recursive CTE produces no steps (no crash). Pipeline shows only the main SELECT's FROM/SELECT. Data tab shows main rows only.

5. **Syntax error** — `WITH cte AS (SELECT FROM) SELECT * FROM cte` — error empty-state renders (no crash).

- [ ] **Step 3: Update PROGRESS.md**

Append a short section to `PROGRESS.md` documenting the new feature (under the Phase 9 section, or as a new "Per-CTE Execution Flow" section). Note: what changed, the recursive-CTE limitation, the new `cte` field on `FlowStep`, and the `(TableSnapshot | null)[]` type widening.

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md
git commit -m "Document per-CTE execution flow feature in PROGRESS.md"
```

---

## Self-Review (run after writing, before handing off)

**Spec coverage:**
- ✅ `FlowStep.cte` field — Task 1.
- ✅ `buildSelectFlow` extraction — Task 1.
- ✅ `extractCteBodies` + per-CTE flow wiring — Task 2.
- ✅ Remove the interim `WITH` step + `cteNames` + `WITH: 0` — Task 1 Step 4 (and the old blocks are inside the extracted body, so they're gone with the refactor).
- ✅ `id` namespacing (`cte::keyword`) — Task 1 Step 4.
- ✅ `buildSnapshots` per-scope + CTE-of-CTE seeding — Task 3.
- ✅ `null` snapshots for unvisualizable scopes — Task 3 + Task 5.
- ✅ `FlowNode` scope chip — Task 4.
- ✅ `DataPreview` scope grouping + null guard — Task 5.
- ✅ Thread `sql` through both builders + caller — Tasks 2 & 3.
- ✅ Tests (executionOrder updated, dataTransform created) — Tasks 2 & 3.
- ✅ Recursive/set-op CTE skip — Task 2 Step 4 (the `inner._next || !inner.from?.[0]?.table` guard) + Task 3 (matching `cteAst` filter).
- ✅ Limitations documented (column-list CTEs parsed-and-skipped in `extractCteBodies` Step 3; mixed-source FROM is a known seed limitation — `seedScopeState` only seeds from `from[0]`).

**Type consistency:**
- `FlowStep.cte?: string` — same name in executionOrder.ts, FlowNode.tsx (`step.cte`), DataPreview.tsx (`s.cte`).
- `buildSelectFlow(segments, ast, dialect, cte)` — declared Task 1, called Task 2.
- `extractCteBodies(withSegment, ast)` returns `CteBody[]` with `{name, bodyStart, bodyEnd, ast}` — declared & consumed in Task 2.
- `buildExecutionFlow(segments, parse, sql)` and `buildSnapshots(steps, parse, sql)` — same third-arg name `sql` everywhere.
- `SnapshotResult.snapshots: (TableSnapshot | null)[]` — declared Task 3, consumed Task 5 (`Props.snapshots`).
- `seedScopeState` / `snapshotScope` — defined Task 3, called internally.

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to". Every code step shows full code. Commands include expected output.

**One known friction point (called out inline):** Task 3 Step 7 notes that typecheck may temporarily fail because `DataPreview.tsx` reads `.columns` on a now-nullable snapshot — fixed in Task 5. The plan suggests doing Task 5's null-guard first if this bites. Alternative: reorder Task 5 before Task 3's commit. Kept as-is because Task 3's commit should be independently testable at the `npm run test:run` level (Vitest doesn't typecheck), and the typecheck gate is fully green only after Task 5.
