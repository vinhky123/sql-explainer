# Per-CTE Execution Flow — Design

**Date:** 2026-07-12
**Status:** Design (pending approval → writing-plans)
**Scope:** Execution-flow visualizer (`/execution-flow`), Pipeline + Data tabs

## Goal

Today the execution-flow visualizer collapses **all** CTEs into a single `WITH` step that only lists their names:

```
WITH  →  FROM  →  WHERE  →  ...  →  SELECT  →  ORDER BY
(“Define 2 CTEs: cte_orders, cte_top”)
```

We want each CTE broken out into its own full logical flow (`FROM → WHERE → … → SELECT`), shown **CTE-by-CTE in definition order**, **before** the main query's flow. So a 2-CTE query renders as:

```
cte_orders:  FROM orders → WHERE status='paid' → SELECT
cte_top:     FROM cte_orders → GROUP BY → SELECT → ORDER BY → LIMIT
main:        FROM cte_top JOIN customers → SELECT → ORDER BY
```

…all in **one sequential vertical chain** (same single-column canvas the app already uses), with the **Data preview** tab building mock rows for every step including the CTE bodies.

This was flagged as a Phase 2 stretch goal in `PROGRESS.md` ("CTE/subquery nested sub-flows … NOT yet rendered as branches"). This design delivers the CTE part.

## Non-goals

- **Subquery / derived-table sub-flows** (scalar subqueries, `IN (SELECT …)`, derived tables in FROM). Same gap, but out of scope here. The flat-list model this design introduces makes a future addition straightforward.
- **Nested/recursive CTEs** (`WITH RECURSIVE`, CTEs whose body is a `UNION`). The parser exposes no `stmt.ast` for these (verified — `cte.stmt.ast` is `undefined` for `WITH RECURSIVE`). They fall back to the existing single-`WITH` step. Documented as a limitation.
- **ERD / optimizer / format / AI** pages. Untouched.

## Decisions (from brainstorming)

1. **Layout = sequential pipeline.** One long vertical chain, CTEs first (definition order), then main query. No swimlanes, no convergence edges.
2. **Data preview = extend to all CTE steps.** `buildSnapshots` produces a snapshot per step across the whole flat list, including CTE bodies. A CTE that references an earlier CTE is seeded from that earlier CTE's final snapshot.
3. **Approach = flat `FlowStep[]` + `cte` scope tag.** Minimal blast radius — canvas, Play/Step/Reset controls, hover-highlight, active-step banner all keep working because they already index into a flat array.

---

## Architecture

### Data model

`FlowStep` gains **one** optional field. Nothing else changes shape.

```ts
// src/lib/sql/executionOrder.ts
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
  cte?: string            // NEW — CTE name this step belongs to; undefined = main query
}
```

`order` keeps being assigned positionally (the existing `steps.forEach((s, i) => s.order = i+1)` already does this — it just runs over a longer list).

### New step ordering

```
Before:  [ WITH, main.FROM, main.WHERE, …, main.LIMIT ]
After:   [ cte1.FROM, …, cte1.SELECT,
           cte2.FROM, …, cte2.SELECT,
           …,
           main.FROM, main.WHERE, …, main.LIMIT ]
```

### Step `id` uniqueness

Currently `id` is the bare keyword (`'FROM'`, `'WHERE'`, …). With multiple scopes in one flat list these collide (two `FROM`s). New rule:

- CTE-scoped step: `id = \`${cte}::${keyword}\`` (e.g. `cte_orders::FROM`)
- Main-query step: `id = keyword` (unchanged — so existing tests that `find(s => s.clause === 'FROM')` and any `id`-based lookups for the main query still work)

React Flow keys nodes by `id`, so uniqueness is required.

---

## What changes, file by file

### 1. `src/lib/sql/executionOrder.ts` — core extraction

**Remove** (superseded — this is the uncommitted `WITH` step work):
- `WITH: 0` entry in the `ORDER` map.
- The `cteNames` collection block and the `if (cteNames.length > 0) addStep('WITH', …)` block.

**Add `cte?: string`** to `FlowStep` (shown above).

**Refactor:** extract the existing post-`WITH` step-building body (the FROM/WHERE/GROUP BY/…/LIMIT `addStep` sequence, lines ~170–196 today) into a reusable helper:

```ts
function buildSelectFlow(
  segments: ClauseSegment[],
  ast: any,
  dialect: Dialect,
  cte: string | undefined,
): FlowStep[]
```

- Takes a *scope-local* segment list + a *scope-local* AST + the scope name.
- Returns the ordered `FlowStep[]` for **one** SELECT (FROM → … → LIMIT).
- Every step gets `cte` set to the passed scope name (`undefined` for main).
- Step `id`s are namespaced by `cte` per the rule above.
- This is a pure extraction of the current logic — no behavior change for the main query.

**New: CTE body extraction.** A function that, given the raw SQL + the top-level AST, produces the per-CTE segment lists with offsets into the **original** SQL string:

```ts
function extractCteBodies(
  withSegment: ClauseSegment | undefined,
  ast: any,
): { name: string; bodyStart: number; bodyEnd: number; ast: any }[]
```

Mechanics:
1. If `withSegment` is missing or `!Array.isArray(ast.with)`, return `[]`.
2. Work on `withSegment.text`, but track an `originOffset = withSegment.startOffset` so every offset can be remapped back to original-space.
3. Scan `withSegment.text` left-to-right. For each CTE:
   - Skip `WITH` / `RECURSIVE` keywords and commas/whitespace.
   - Read the CTE name (identifier; may be quoted — accept `"..."`).
   - Skip optional column list `( col1, col2 )` (paren-balanced).
   - Expect `AS`.
   - Expect `(`; from there, track paren depth (+ string/comment state, reusing the same lexical awareness as `clauseSplitter`) to find the matching `)`. That range is `(bodyStart, bodyEnd)` in withSegment-text space; add `originOffset` to get original-space offsets.
4. Pair each `(bodyStart, bodyEnd)` with its AST from `ast.with[i].stmt.ast`. If `stmt.ast` is missing (recursive/UNION CTE), **skip** the body — mark the CTE as "unvisualizable" so the caller can fall back. (See Limitations.)

**New: CTE body clause splitting.** For each extracted CTE body:

```ts
    const bodyText = sql.slice(body.bodyStart, body.bodyEnd)
    const bodySegs = splitClauses(bodyText)
    // splitClauses returns offsets relative to bodyText; remap to original-SQL space
    // (what the Monaco editor displays) by adding the body's start offset:
    const bodySegsRemapped = bodySegs.map(s => ({
      ...s,
      startOffset: s.startOffset + body.bodyStart,
      endOffset:   s.endOffset   + body.bodyStart,
    }))
```

(`splitClauses` is SQL-lexical and already Jinja-aware, so it works on a CTE body substring. The body text includes the CTE's own `SELECT …` so the `SELECT` keyword is the first segment — same shape as the main query.)

**New top-level orchestration** in `buildExecutionFlow`:

```ts
export function buildExecutionFlow(segments, parse): FlowStep[] {
  if (!parse.ok || !parse.ast) return []
  const ast = pick(parse.ast)
  if (!ast) return []

  const withSeg = segments.find(s => s.keyword === 'WITH')
  const cteBodies = extractCteBodies(withSeg, ast)
  const dialect = parse.dialect ?? 'postgresql'

  const steps: FlowStep[] = []

  // 1. Each CTE, in definition order
  for (const body of cteBodies) {
    if (!body.ast) continue                 // recursive/UNION CTE → skip (Limitations)
    const bodyText = sql.slice(body.bodyStart, body.bodyEnd)
    const bodySegs = splitClauses(bodyText).map(remap to original-space)
    steps.push(...buildSelectFlow(bodySegs, body.ast, dialect, body.name))
  }

  // 2. Main query (everything except the WITH segment)
  const mainSegs = segments.filter(s => s.keyword !== 'WITH')
  steps.push(...buildSelectFlow(mainSegs, ast, dialect, undefined))

  // 3. Re-number positionally (existing behavior)
  steps.sort by ORDER; steps.forEach((s, i) => s.order = i + 1)
  return steps
}
```

**Note on `sql`:** `buildExecutionFlow` currently takes `(segments, parse)` and does **not** receive `sql`. CTE body extraction needs the raw SQL to slice bodies. Two options (pick in plan):
- (a) Pass `sql` as a third arg: `buildExecutionFlow(segments, parse, sql)`. Caller `ExecutionFlow.tsx` already has `sql`. Cleanest.
- (b) Recover `sql` by joining `withSegment.text` + main segments — lossy and ugly.

**Recommend (a).** Update the one caller and the test helpers.

### 2. `src/lib/sql/dataTransform.ts` — extend `buildSnapshots` to CTE steps

Currently `buildSnapshots` builds mock rows for the main query only, seeded once via `buildSourceTable(ast)` at the top. Change it to walk the flat step list **per scope**, seeding fresh state at the start of each scope.

**New signature** (third arg, same rationale as executionOrder):

```ts
export function buildSnapshots(
  steps: FlowStep[],
  parse: ParseResult,
  sql: string,
): SnapshotResult | null
```

**Algorithm:**

```ts
// Group consecutive steps by their `cte` scope, preserving order.
// scopes = [ { cte: 'cte_orders', steps: [...] }, { cte: 'cte_top', steps: [...] },
//            { cte: undefined, steps: [...] } ]

const cteResult = new Map<string, WorkState>()   // name → final state of that CTE

for (const scope of scopes) {
  const scopeAst = scope.cte == null ? mainAst : astOfCte(scope.cte)
  if (!scopeAst || scopeAst.type !== 'select') {
    // can't snapshot this scope → emit nulls for its steps (Data tab shows "no preview")
    pushEmptySnapshots(scope.steps.length); continue
  }

  // Seed:
  //   - FROM references real tables           → buildSourceTable(scopeAst)
  //   - FROM references an earlier CTE name   → reuse cteResult.get(thatCte) as the seed
  //     (the CTE's final SELECT snapshot becomes this scope's starting rows)
  let cur = seedScopeState(scopeAst, cteResult, parse)
  if (!cur) { pushEmptySnapshots(scope.steps.length); continue }

  const states = [cur]
  for (let i = 1; i < scope.steps.length; i++) {
    cur = applyStep(cur, scope.steps[i], scopeAst, tables, dialect)
    states.push(cur)
  }
  snapshots.push(...states.map((st, i) => toSnapshot(st, scope.steps[i], scopeAst, tables)))

  if (scope.cte) cteResult.set(scope.cte, cur)   // cache final state for dependents
}

return { snapshots, source: mainSource }
```

**`seedScopeState`** decides the seed:
- If `scopeAst.from[0].table` is a name found in `cteResult`, seed from that CTE's final state (project its `SELECT` output columns). This is what makes a CTE-of-a-CTE chain visually carry data forward.
- Otherwise call `buildSourceTable(scopeAst)` (existing behavior — generates mock rows from real table names + inferred columns).

**`mainSource`** (referenced in the return) = `buildSourceTable(mainAst)` — computed once for the `SnapshotResult.source` field (kept for backward compat with the type; `DataPreview` reads only `.snapshots`).

**Fallback:** if a scope can't be seeded (e.g. the CTE references a table `buildSourceTable` can't handle, or `stmt.ast` is missing), that scope's steps get a `null` snapshot. The Data-preview UI already needs a small "no preview for this step" state (next section).

**`source` field on the result:** today `SnapshotResult.source` is the main query's source table (used by `DataPreview`? — actually `DataPreview` only reads `.snapshots`, `source` appears unused by the UI but is on the type). Keep returning the main query's source for backward compat; CTE sources stay internal.

### 3. `src/features/execution-flow/FlowNode.tsx` — show the CTE scope

Small visual additions:
- When `step.cte` is set, render a small **scope label** at the top of the card: e.g. an indigo chip `cte_orders` above (or beside) the order badge. Makes it obvious which CTE you're looking at as the chain scrolls.
- Add a `WITH`/CTE icon to `clauseIcon` (e.g. lucide `Braces` or `Layers`) for any future CTE-header affordance — not strictly required since CTEs no longer have a dedicated step, but harmless.
- No structural changes — the node still renders `step.order`, `step.clause`, `step.snippet`, chips. The `cte` chip is additive.

### 4. `src/features/execution-flow/DataPreview.tsx` — handle per-scope snapshots + nulls

Two changes:
1. **Step pills (top row):** group visually by scope. Render a tiny `cte_orders` label above the first pill of each scope, or a divider, so the pill row reads as CTE-1 | CTE-2 | main. (Mirrors the FlowNode scope chip.)
2. **Null snapshots:** when `snapshots[idx]` is null (a scope we couldn't model), show "No preview available for this CTE." instead of crashing on `snap.columns.length`. Add a guard.

The flat `snapshots[]` and `steps[]` arrays stay index-aligned 1:1 — that invariant is what lets the existing `idx`/`onStepClick` logic keep working.

### 5. `src/features/execution-flow/ExecutionFlow.tsx` — pass `sql` through

- `buildExecutionFlow(segments, parse)` → `buildExecutionFlow(segments, parse, sql)`
- `buildSnapshots(steps, parse)` → `buildSnapshots(steps, parse, sql)`

Everything else (Play/Pause/Step/Reset, active-step banner, empty/error states, the `view` toggle) is **unchanged** — it all operates on the flat arrays.

### 6. Tests

Update existing + add new. All in `src/lib/sql/`:

- **`executionOrder.test.ts`:**
  - Update the `flow()` / `flowDialect()` helpers to pass `sql` (third arg).
  - Keep all existing assertions (they target main-query steps via `s.clause === 'FROM'` etc., which still work — the main query's clauses are unchanged).
  - The existing `cte AS (SELECT id FROM users) SELECT a FROM cte` test: assert the CTE's `FROM` and `SELECT` steps now appear (previously they didn't), with `cte === 'cte'`, and correct original-space `startOffset`/`endOffset` pointing inside `(SELECT id FROM users)`.
  - New: multi-CTE test — `cte1`, `cte2` each produce their own steps, in definition order, before the main query.
  - New: step `id` uniqueness — all ids in a multi-CTE flow are distinct.
  - New: offset remapping — a CTE body step's `snippet` equals the exact substring of the original SQL between its `startOffset` and `endOffset`.

- **`dataTransform.test.ts` (NEW):** doesn't exist today. Add it for this work:
  - `buildSnapshots` returns one snapshot per step across CTE + main scopes.
  - A CTE whose `FROM` references an earlier CTE seeds from that CTE's final snapshot (its starting rows equal the referenced CTE's final rows, not freshly-generated mock rows).
  - A scope whose AST is missing (recursive CTE) emits `null` snapshots without throwing.

- **Run:** `npm run test:run` must stay green (currently 89/89). Target: +new tests, 0 regressions.

### 7. Verification (per `AGENTS.md`)

After implementation:
```bash
npm run typecheck   # must be clean (watch noUnusedLocals — remove the deleted WITH-step code fully)
npm run test:run    # all green
npm run lint        # 0 errors (3 pre-existing react-refresh warnings unchanged)
npm run build       # passes
```

Then manual: `npm run dev` → load a multi-CTE query → `/execution-flow` → Play — the animation walks cte1 → cte2 → main, each as its own clause chain; hover a CTE step highlights the right lines in the editor; the Data tab shows rows flowing through the CTEs.

---

## Limitations (documented, with graceful fallback)

1. **Recursive / UNION CTEs** (`WITH RECURSIVE`, or a CTE body containing `UNION`): `node-sql-parser` does not expose `cte.stmt.ast` for these (verified — `stmt.ast` is `undefined`). Such CTEs are **skipped** in both Pipeline and Data views — they don't get per-clause steps, and don't crash. Future work could parse `cte.stmt` directly if needed.
2. **CTEs referencing real tables the mock-data layer can't model** (`buildSourceTable` returns null): that CTE's scope emits `null` Data snapshots; Pipeline steps still render.
3. **Column-list CTEs** (`cte (a, b) AS (SELECT …)`): the optional column list is parsed-and-skipped during body extraction; it does not rename the snapshot columns. Minor cosmetic gap.
4. **Subqueries / derived tables** (non-CTE): still not expanded into sub-flows. Same gap as before; out of scope.
5. **Mixed-source FROM in a CTE** — a CTE whose FROM joins a real table to an earlier CTE (`FROM cte_x JOIN real_table …`): the seed rule keys off `from[0].table`. If `from[0]` is the CTE, the real joined table won't be in the seed's column set → `buildSourceTable`-style column inference for joined real tables is skipped for that scope. The scope still snapshots (starting from the CTE's rows), but joined-table columns may show as missing. Documented; future polish is to merge the CTE-seed with `buildSourceTable` for the remaining `from` entries.

## Files touched — summary

| File | Change |
|---|---|
| `src/lib/sql/executionOrder.ts` | Remove `WITH` step + `cteNames`; add `cte?` to `FlowStep`; refactor step-building into `buildSelectFlow`; add `extractCteBodies`; thread `sql` through `buildExecutionFlow`. |
| `src/lib/sql/dataTransform.ts` | Walk flat steps grouped by `cte` scope; seed each scope from real tables or an earlier CTE's final state; thread `sql` through `buildSnapshots`; emit `null` snapshots for unvisualizable scopes. |
| `src/features/execution-flow/FlowNode.tsx` | Render a `cte` scope chip when `step.cte` is set. |
| `src/features/execution-flow/DataPreview.tsx` | Group step pills by scope; guard against `null` snapshots. |
| `src/features/execution-flow/ExecutionFlow.tsx` | Pass `sql` to `buildExecutionFlow` and `buildSnapshots`. |
| `src/lib/sql/executionOrder.test.ts` | Update helpers for new signature; add CTE step/offset/id tests. |
| `src/lib/sql/dataTransform.test.ts` | **NEW** — per-scope snapshot tests. |

No new dependencies. No routing, store, or build-config changes. The `parser`/`flow` Vite chunks are unaffected.

## Resolved decisions

- **Signature change:** pass `sql` as a third positional arg to `buildExecutionFlow(segments, parse, sql)` and `buildSnapshots(steps, parse, sql)`. Both callers (`ExecutionFlow.tsx`) already hold `sql` from the store. Rejected alternative — attaching raw SQL to `ParseResult` — would muddy that type's responsibility (it's a parse result, not a carrier for input). The `jinja` machinery already strips SQL before parsing, so the raw `sql` arg is the only way to slice original-space CTE bodies.
