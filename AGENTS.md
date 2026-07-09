# AGENTS.md

Compact guide for OpenCode sessions working in this repo. Read `PROGRESS.md` first — it is the detailed phase-by-phase handoff with the real current state, `node-sql-parser` AST shape docs, and a "Known gotchas" section. `PLAN.md` is the original spec.

## Commands

```bash
npm run typecheck   # tsc -b --noEmit  — run after every edit; must be clean
npm run build       # tsc -b && vite build  — typecheck runs first, fails fast
npm run lint        # eslint . (flat config, eslint.config.js)
npm run test:run    # vitest run  — unit tests for lib/ (one-shot, CI-friendly)
npm run test        # vitest      — watch mode
npm run dev         # vite dev server on :5173
npm run preview     # serve the dist/ build
```

## Tests

Unit tests run on **Vitest** (`vitest.config.ts`, jsdom env, specs colocated as `src/lib/**/*.test.ts`). The pure-logic layer — parser, clauseSplitter, executionOrder, erdExtractor, rules, parsePlan, formatter — is covered. Run `npm run test:run` after touching any `lib/` file. Test files obey the same `noUnusedLocals`/`noUnusedParameters` rules as app code. React component / browser testing is still manual (Playwright is not a dep — install transiently if needed, then remove).

## Typecheck is strict about unused code

`tsconfig.app.json` has `noUnusedLocals` + `noUnusedParameters`. Every edit must remove unused imports/params/vars or `npm run typecheck` fails. This is the most common breakage when editing.

## Architecture

- Vite + React 18 + TS SPA, 100% client-side, no backend. Entrypoint: `src/main.tsx` → `src/App.tsx`.
- All routes are `React.lazy` + `Suspense` (code-split per page). Heavy chunks load only on their route: `parser` (node-sql-parser, 2.6 MB), `monaco`, `flow` (+ dagre), `formatter`, `llm` (openai). Do not introduce a static import that pulls these into the main entry — it defeats the split.
- Path alias: `@/*` → `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`).
- Right-panel tools share the `Workbench` shell (`components/layout/Workbench.tsx`): Monaco editor on the left, tool panel on the right.

### Two input modes (don't conflate)

- **Workbench pages** (format, execution-flow, erd, optimize, ai) read SQL from `sqlStore` (persisted, key `sql-explainer-sql`) via the Monaco editor.
- **`/explain-plan`** does NOT use the Workbench — it has its own textarea bound to `planStore` (persisted, key `sql-explainer-plan`), separate from `sqlStore`. EXPLAIN input is not SQL.

### Stores

`sqlStore`, `planStore`, `settingsStore` (LLM config) are persisted. `editorStore` (live Monaco instance + `highlight(start,end)` using char offsets) and `uiStore` (settings modal open) are NOT persisted. `editorStore.highlight` uses `model.getPositionAt(offset)` — pass character offsets, not line:col.

## node-sql-parser (v5.3) — the biggest gotcha source

- It is CommonJS. In app code it is already wrapped by `parseSql(sql, dialect)` in `lib/sql/parser.ts` — **call `parseSql`, never instantiate `Parser` directly**. `import { Parser } from 'node-sql-parser'` (named) happens to work under Vite but **fails in plain Node ESM** (e.g. standalone test scripts) — use `import pkg from 'node-sql-parser'; const { Parser } = pkg` if you must.
- `parseSql` returns `{ ok, ast, error }` and normalizes `ast` to an **array**. The first SELECT is usually `ast[0]`.
- AST quirks an agent will miss (verified — see PROGRESS.md "Known gotchas" for the full list):
  - `SELECT *` → `columns: [{ expr: { type: 'column_ref', column: '*' } }]` — `column` is the **string** `"*"`, not the `{expr:{value}}` object named columns use, and not `type:'star'`. Check all three shapes.
  - `ast.limit` is **always** `{ seperator: "", value: [] }` even with no LIMIT clause. Test `ast.limit?.value?.length > 0`, never truthiness of `ast.limit`.
  - `CROSS JOIN` is mis-parsed (PG mode) as `{ as: 'CROSS', join: 'INNER JOIN', on: null }`. Detect "join with no `on`", not `join === 'CROSS JOIN'`.
  - `NOT IN (subquery)` and scalar subqueries in SELECT wrap the subquery in an element carrying an `ast` property.
  - `COUNT(*)` → `{ type: 'aggr_func', name: 'COUNT', args: { expr: { type: 'star' } } }`.
- **dbt/Jinja input:** `parseSql` auto-strips Jinja (`{{ ref('x') }}`, `{% set %}`, `{% if %}...{% endif %}`, etc.) via `lib/sql/jinja.ts` before node-sql-parser, and returns `jinja: { detected, refs, vars, warnings }` on `ParseResult`. `clauseSplitter` skips tags in-place (original-space offsets); `rules.runHeuristics` scans stripped SQL then remaps offsets back to original. **Call `parseSql`/`formatSql` as-is** — never feed raw dbt SQL to `parser.astify` or `sqlFormat` directly. The formatter does format-around (reinserts `{{ }}` via `formatAroundJinja`). Jinja inside SQL string literals is intentionally preserved (it's valid SQL text). Control-block bodies (`{% if %}`/`{% for %}`) are dropped (not compilable client-side) — surfaced as warnings.

## Other toolchain quirks

- **Monaco theme**: must be registered via **both** `beforeMount` and `onMount` for multiple editor instances to pick it up (FormatPage has 2). See `lib/monaco/theme.ts`.
- **sql-formatter v15**: there is **no** `commaPosition` or `newlineBeforeOpenParen` option (older docs lie). Real options are in `lib/sql/formatter.ts`.
- **React Flow v12** (`@xyflow/react`): `NodeProps` data is untyped by default; code casts `data as SomeInterface`. ERD edges use per-column handles — `sourceHandle`/`targetHandle` on edges must match `Handle id={col.name}` in `TableNode`; change both together.
- **Plan heat** (`lib/queryPlan/parsePlan.ts`) uses **exclusive/self time** (inclusive − children), not inclusive — otherwise the root is always ~100%. Guard `timeShare` on `actualTotalTime != null` so non-ANALYZE plans render neutral.

## Conventions

- No code comments unless asked.
- `no-explicit-any` is **off** — `any` is used freely for AST nodes. Don't add AST types unless asked.
- Lint will show **3 `react-refresh/only-export-components` warnings** (button.tsx, FormatOptionsPanel.tsx, seo.tsx) — these are an expected shadcn pattern, not errors. Don't "fix" them by splitting files unless asked. Target state is 0 errors.
- SEO: `useSeo({ title, description, jsonLd? })` from `lib/seo.tsx` per page. The canonical URL / sitemap / OG use placeholder domain `sql-explainer.vercel.app` and placeholder BMC/Ko-fi URLs — update at deploy time.

## Where things live

- Feature logic: `lib/sql/*` (parser, formatter, clauseSplitter, executionOrder, erdExtractor, **jinja**), `lib/queryPlan/parsePlan.ts`, `lib/heuristics/rules.ts`, `lib/llm/*`.
- UI features: `features/{formatter,execution-flow,erd,query-plan,optimizer,ai-explain,donation}/*`.
- Pages: `src/pages/*` (one per route, all lazy).
