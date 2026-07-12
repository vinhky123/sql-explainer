# SQL Explainer — Progress Log

## Phase 0: Scaffold ✅

**Status:** Complete. Typecheck + production build pass. Dev server boots in 249ms on http://localhost:5173.

**What was built:**
- Vite 6 + React 18 + TypeScript project (manual scaffold, no interactive prompts)
- Tailwind CSS 3 with dark dev-tool theme (zinc-950 bg, indigo/emerald accents, glassmorphism)
- shadcn/ui-style primitives: `Button`, `Tabs`, `Select` (Radix-based)
- Monaco Editor with custom "sql-explainer" theme (purple keywords, green strings)
- Zustand stores: `sqlStore` (sql + dialect, persisted), `settingsStore` (theme + LLM config, persisted)
- React Router v6 with routes: `/`, `/format`, `/execution-flow`, `/erd`, `/explain-plan`, `/optimize`
- `Workbench` shell: dialect selector + live parse status badge + error bar + editor/right-panel split
- `HomePage` landing with hero + 6 feature cards + sample-query loader
- `Header` (nav + GitHub + Buy-me-a-coffee), `Footer`, `AppLayout`
- SQL libs scaffolded: `lib/sql/parser.ts` (node-sql-parser wrapper), `lib/sql/formatter.ts` (sql-formatter wrapper)
- Manual chunk splitting (monaco/flow/parser/formatter) to keep bundle sane
- ESLint 9 flat config, .gitignore, favicon.svg

**Notes:**
- `node-sql-parser` chunk is 2.6MB (514KB gzipped) — expected, it's code-split and lazy-loadable later if needed.
- Dialect list covers 10 engines across Popular/Enterprise/Analytics/Streaming groups.
- Live syntax validation already works in the workbench (green/red badge + error bar) — foundation for all later phases.
- Placeholder pages render the Workbench with editor live + a "ships in Phase N" panel.

**To verify:** `npm run typecheck`, `npm run build`, `npm run dev` all pass.

---

## Phase 1: Formatter + Validator ✅

**Status:** Complete. Typecheck + build pass.

**What was built:**
- `FormatPage` (`/format`): full formatter with live read-only Monaco preview, copy, download `.sql`, and "Apply" (replace editor contents).
- `FormatOptionsPanel`: indent (2/4/tabs), keyword case (UPPER/lower/Keep), indent style (Standard/Tabular), logical operator newline (before/after), expression width, lines-between-queries, dense operators, and Minify toggle (disables style options when active).
- `lib/sql/formatter.ts` extended to real sql-formatter v15 API (`indentStyle`, `logicalOperatorNewline`, `expressionWidth`, `denseOperators`); added `minifySql()` helper.
- `lib/monaco/theme.ts` extracted so both editor instances (input + read-only output) reliably register the `sql-explainer` theme via `beforeMount` + `onMount`.
- Validator (already live from Phase 0): green/red parse badge in workbench toolbar + red error bar with line:col; format preview is gated on a valid parse with a friendly "fix the syntax error" empty state.
- Input/output line counts shown in the output header.

**Notes:**
- Discovered sql-formatter v15 dropped `commaPosition` / `newlineBeforeOpenParen` (present in older docs). Replaced with `indentStyle` (standard/tabular) and `logicalOperatorNewline` — matches the actual installed types.
- Minify reuses the formatter with dense operators + zero width, then collapses remaining newlines.

**To verify:** `npm run typecheck`, `npm run build`.

---

## Phase 2: Execution Order Visualizer ✅

**Status:** Complete. Typecheck + build pass.

**What was built:**
- `lib/sql/clauseSplitter.ts` — scans raw SQL char-by-char (tracks paren depth + string/comment state) and slices top-level clauses (WITH/SELECT/FROM/WHERE/GROUP BY/HAVING/ORDER BY/LIMIT/OFFSET/UNION/INTERSECT/EXCEPT/WINDOW) with character offsets for editor highlighting.
- `lib/sql/executionOrder.ts` — combines clause segments + AST metadata into ordered `FlowStep[]` in logical execution order (FROM→WHERE→GROUP BY→HAVING→SELECT→DISTINCT→ORDER BY→LIMIT). Extracts tables, join types, columns, aggregates, row-direction heuristics. Helpers: `colName()`, `collectAggregates()`.
- `store/editorStore.ts` — non-persisted Zustand store holding the Monaco editor instance + `highlight(startOffset, endOffset)` (uses `model.getPositionAt` + `setSelection` + `revealLineInCenter`) for cross-panel editor control.
- `SqlEditor` now registers itself into `editorStore` on mount.
- `features/execution-flow/FlowNode.tsx` — custom React Flow node card: order badge, clause icon, description, SQL snippet, metadata chips (tables=sky, columns=muted, aggregates=fuchsia). Direction-colored labels.
- `features/execution-flow/ExecutionFlow.tsx` — React Flow canvas (vertical pipeline, smoothstep edges, animated active edge), Play/Pause/Step/Reset controls with 1.2s auto-advance, active-step banner, hover-to-highlight-in-editor, click-to-select. Empty/error states handled.
- `pages/ExecutionFlowPage.tsx` wired into router at `/execution-flow`.
- Imported `@xyflow/react/dist/style.css`.

**Notes:**
- Snippets come from slicing the user's raw SQL (not AST reconstruction) so they match the editor exactly — this is what makes offset-based highlighting accurate.
- `buildExecutionFlow` signature is `(segments, parse)` — the `sql` param was dropped as unused.
- React Flow v12 `NodeProps` data is untyped-by-default; used a `FlowNodeData` interface cast.
- Set-op (UNION/INTERSECT/EXCEPT) parallel branches and CTE/subquery nested sub-flows are detected by the splitter but NOT yet rendered as branches — they show as linear steps. This is a known Phase 2 stretch goal left for polish.

**To verify:** `npm run typecheck`, `npm run build`. Then `npm run dev` → load sample query on home → go to `/execution-flow` → click Play.

---

## Phase 3: ERD / Schema Diagram ✅

**Status:** Complete. Typecheck + build + dev server boot all pass. Extractor logic verified end-to-end against DDL + SELECT inputs.

**What was built:**
- `lib/sql/erdExtractor.ts` — walks the `node-sql-parser` AST array and builds an `ErdModel { tables, relationships, indexes, source, warnings }`. Handles:
  - `CREATE TABLE`: column defs (name, formatted data type, nullability, inline `PRIMARY KEY`/`UNIQUE`, `DEFAULT`), table-level `PRIMARY KEY (...)` / `UNIQUE (...)` / `FOREIGN KEY (...) REFERENCES` constraints (incl. composite keys).
  - `ALTER TABLE ... ADD COLUMN` / `ADD CONSTRAINT` (FK + PK).
  - `CREATE [UNIQUE] INDEX` → `ErdIndex[]` with table/columns/unique.
  - `SELECT` lineage: alias-aware extraction of referenced tables + columns (from SELECT list, JOIN ON, WHERE, GROUP BY, HAVING, ORDER BY) into lightweight `source:'select'` table cards, plus join relationships derived from `ON col = col` (FK side chosen via `_id` naming).
  - **Naming-heuristic inference:** columns matching `_id`/`Id`/`_guid`/`Uuid` with no explicit FK are matched to a table by pluralizing/singularizing the stem (`product_id` → `products`), targeting the PK column (or `id`), marked `inferred:true`.
- `features/erd/erdLayout.ts` — dagre auto-layout wrapper. Shared dimension constants (`NODE_WIDTH=260`, `HEADER_HEIGHT=40`, `ROW_HEIGHT=26`) used by both the layout estimator and `TableNode` so heights agree. LR (default) / TB directions.
- `features/erd/TableNode.tsx` — custom React Flow node: table header (icon + name + `ref` badge for lineage tables), per-column rows with PK key icon (amber) / unique icon (cyan) / type chip, hover highlight, and **per-column invisible source+target Handles** (id = column name) so edges anchor at exact columns (dbdiagram-style).
- `features/erd/erdExport.ts` — `exportDbml(model)` → dbdiagram.io-compatible DBML (`Table` blocks with `[pk]/[not null]/[unique]/[default: ...]` settings + `Ref` lines, `>` for many-to-one, `// inferred` notes); `exportPng()` / `exportSvg()` via `html-to-image` capturing `.react-flow__viewport` (hides controls during capture, sets `#09090b` bg, pixelRatio 2).
- `features/erd/ErdCanvas.tsx` — React Flow canvas: solid emerald edges for explicit FK/join, dashed amber `?` edges for inferred; hover a column to trace its edges (purple highlight); toolbar with layout-direction toggle, fit-view, DBML/SVG/PNG export buttons; stats (tables, rels, guessed count, PK count); warnings strip; legend footer. Empty / parse-error / no-tables states.
- `pages/ErdPage.tsx` at `/erd` (replaces PlaceholderPage) — wired in `App.tsx`. Includes a "Sample DDL" toolbar button that loads a 5-table e-commerce schema (customers/products/orders/order_items + 2 indexes) for instant demo.
- `vite.config.ts` — added `dagre` to the `flow` manualChunk (flow chunk now 408KB / 135KB-gz).

**New deps:** `dagre`, `@types/dagre`, `html-to-image`.

**Verified end-to-end (bundled test run):**
- DDL input → 4 tables, 3 relationships (2 explicit FKs + 1 inferred `order_items.product_id → products.id`), 1 index; column types/nullability/PK/unique correct.
- SELECT lineage → 2 tables with referenced-column subsets, 1 explicit join rel.
- Empty string → `source:'empty'`; syntax error → `source:'empty'` (no crash).

**Notes:**
- Per-column handles: every column gets a left (target) + right (source) Handle sharing `id=col.name`; React Flow matches `sourceHandle`/`targetHandle` on edges by id. Handles are 1px/invisible — edges anchor correctly, UI stays clean.
- Edge `sourceHandle`/`targetHandle` fall back to node center if a column handle is missing (e.g. lineage table without the referenced column) — graceful, no crash.
- `node-sql-parser` constraint AST shapes vary slightly between dialects; the extractor keys off `resource:'column'|'constraint'` + `constraint_type` upper-cased, which holds across PG/MySQL in testing.
- Export captures the current viewport transform; for full-graph export, user clicks fit-view first (documented in legend). This is the standard React Flow + html-to-image MVP pattern.
- Pre-existing lint warnings remain in `button.tsx`, `FormatOptionsPanel.tsx`, and `tailwind.config.ts` (untouched, not Phase 3 scope).

**To verify:** `npm run typecheck`, `npm run build`. Then `npm run dev` → `/erd` → "Sample DDL" → hover columns / export DBML.

---

## Phase 4: Query Plan Explainer ✅

**Status:** Complete. Typecheck + build + dev server boot all pass. Parser logic verified end-to-end against both PostgreSQL JSON and indented-text EXPLAIN output.

**What was built:**
- `store/planStore.ts` — persisted Zustand store (key `sql-explainer-plan`) holding `planText` + `setPlanText`/`loadSample`/`clear`. Separate from `sqlStore` because EXPLAIN input is not SQL.
- `lib/queryPlan/parsePlan.ts` — dual-format plan parser + analysis:
  - **Format detection:** leading `[`/`{` → JSON; else → text.
  - **JSON parser:** walks PostgreSQL `EXPLAIN (ANALYZE, FORMAT JSON)` `Plan` tree → unified `PlanNodeData` (nodeType, relation, costs, planRows/Width, actual times/rows/loops, extra attributes bag, children). Captures `Execution Time` / `Planning Time`.
  - **Text parser:** stack-based indented parser for PostgreSQL text plans. Regex extracts `(cost=A..B rows=N width=W)` and `(actual time=S..E rows=N loops=L)`; non-cost lines (`Filter:`, `Hash Cond:`, `Sort Method:`…) attach as `extra` to the current node. Captures `Execution Time:`/`Total runtime:` lines.
  - **Heat:** computes inclusive `nodeTime = actualTotalTime × loops`, then `exclusiveTime = inclusive − Σchildren` (clamped ≥0), and `timeShare = exclusive / total × 100`. Using **self/exclusive time** (not inclusive) means the root is no longer falsely 100% — the real bottleneck surfaces.
  - **Bottleneck detection → `PlanFinding[]`:** slowest-node-dominates (≥20% self → critical), seq scan on large table (>10K rows), nested loop with high loops (>1K), sort spill to disk (`Sort Method: external merge`/`Sort Space Used`), large in-memory sort, row-estimate mismatch (planRows vs actualRows, >10× or <0.1× → stale-stats info).
  - `buildNarrative()` — plain-English summary paragraph lines.
- `features/query-plan/PlanNodeView.tsx` — custom React Flow node: operation icon (seq scan / index / hash join / nested loop / sort / aggregate / hash / limit), heat-colored left bar + border (emerald <10%, amber 10–30%, red >30%), metrics grid (rows, cost, actual ms, % self), 2-line `extra` preview, red ring + alert icon when flagged.
- `features/query-plan/PlanTree.tsx` — React Flow canvas (dagre TB layout) + 3 tabs (Tree / Findings / Narrative). Findings list is severity-sorted and clickable → jumps to the node on the tree (purple edge highlight + selected ring). Narrative tab renders the walking summary + heat legend. Empty / parse-error states with the supported-format hint.
- `pages/ExplainPlanPage.tsx` — **does NOT use the Workbench shell** (EXPLAIN input isn't SQL). Custom two-pane layout: left = monospace `<textarea>` paste box bound to `planStore` (with format badge: JSON/TEXT/—), right = `PlanTree`. Top bar with title, live format badge, "Sample" button (loads a 6-node PostgreSQL ANALYZE JSON plan demonstrating a seq-scan bottleneck, a disk sort spill, and a stale-stats row mismatch), and Clear.

**Verified end-to-end (bundled test run, JSON + text inputs produce identical trees):**
- 6-node tree (Limit → Sort → Hash Join → Seq Scan orders / Hash → Seq Scan customers) parsed correctly.
- Heat: Seq Scan orders 35.4% self (red), Hash Join 35.4% self (red), Sort 29.0% self (amber), root Limit 0.0% self (green) — correctly pinpoints the scan, not the root.
- 4 findings: critical (Seq Scan dominates self-time), warning (sort spilled to disk), warning (seq scan on 1.2M-row table), info (Hash Join row estimate 100K vs actual 1.2M, 12× mismatch).
- Text format now also captures `Execution Time: 423.456 ms`.
- Empty + garbage inputs → `ok:false`, no crash.

**Notes:**
- Exclusive-time approach mirrors flamegraph "self time" — far more actionable than inclusive for finding where to optimize. Inclusive `nodeTime` is still stored for reference.
- Text parser is PostgreSQL-style (best-effort, per PLAN.md risk mitigation). MySQL/T-SQL text plans are not supported; JSON is the stable primary path.
- `planStore` is independent of `sqlStore`, so the EXPLAIN paste box doesn't disturb the SQL editor state on other routes.
- Plan tree reuses the `flow` manualChunk (dagre + @xyflow/react) from Phase 3 — no new vendor chunk. Index chunk grew to 165KB/52KB-gz (plan parser + components live in main).
- Pre-existing lint warnings remain in `button.tsx`, `FormatOptionsPanel.tsx`, `tailwind.config.ts` (untouched, not Phase 4 scope).

**To verify:** `npm run typecheck`, `npm run build`. Then `npm run dev` → `/explain-plan` → "Sample" → Tree / Findings / Narrative tabs.

---

## Phase 5: Performance Optimizer ✅

**Status:** Complete. Typecheck + build + dev server boot all pass. Rule engine verified end-to-end (11/12 rules fire on the sample query; 0 false positives on a clean query).

**What was built:**
- `lib/heuristics/rules.ts` — 12-rule heuristic engine over the `node-sql-parser` AST. `runHeuristics(sql, astArray)` iterates SELECT statements and runs each rule in a try/catch (one rule failing never breaks the others). Each rule returns `Finding[]` with severity, title, explanation, suggestion, and — where locatable — a `snippet` + `startOffset`/`endOffset` for editor highlighting, plus an optional `rewrite` for the Apply button. AST shapes were verified by direct inspection (`node-sql-parser` v5.3 quirks documented below).
  - **Rules:** (1) `SELECT *`, (2) `LIKE '%x'` leading wildcard, (3) function-on-column in WHERE (non-sargable), (4) implicit type cast on numeric-looking columns (`id = '5'`), (5) `OR` across different columns, (6) join without `ON` (Cartesian product), (7) scalar subquery in SELECT, (8) `NOT IN (subquery)` NULL-unsafety, (9) `DISTINCT` redundant after `GROUP BY`, (10) `ORDER BY ... LIMIT` without supporting index, (11) large `IN (...)` list (≥20 values), (12) `COUNT(*)` existence check → suggest `EXISTS`.
  - Two rules ship with auto-rewrites: implicit-cast (unquotes the literal) and redundant-DISTINCT (removes the keyword). Apply = `sql.replace(snippet, rewrite)`.
- `features/optimizer/OptimizerPanel.tsx` — severity-sorted findings list with counts (critical/warning/info badges). Click a finding → `editorStore.highlight(startOffset, endOffset)` jumps the editor to the offending code. "Apply fix" button (emerald, shown only when `rewrite !== undefined`) rewrites the SQL in-place via `sqlStore.setSql`; the panel re-derives findings after each apply. Empty / syntax-error / non-SELECT / clean-query states all handled.
- `pages/OptimizePage.tsx` at `/optimize` (replaces the last PlaceholderPage). Uses the Workbench shell (left = SQL editor, right = OptimizerPanel) with a "Sample" toolbar button that loads a deliberately-bad query triggering 11 rules.

**Verified end-to-end (bundled test run):**
- Sample query → 11 findings across all severities (1 critical cartesian-join, 4 warning, 6 info), each with a correctly-located snippet: `SELECT DISTINCT *`, `'%son'`, `DATE(o.created_at)`, `'5'`, `OR`, `JOIN`, `NOT IN (`, `DISTINCT`, `ORDER BY`, `IN (`, `COUNT(*)`.
- Clean query (`SELECT id, name FROM users WHERE id = 5`) → 0 findings.
- Non-SELECT (`CREATE TABLE …`) → 0 findings (engine only analyzes SELECTs).
- Empty string → 0 findings.

**Notes / `node-sql-parser` v5.3 quirks discovered:**
- `SELECT *` parses as `columns: [{ expr: { type: 'column_ref', column: '*' } }]` where `column` is the **string** `"*"` (not the `{expr:{value}}` object shape that named columns use, and not `type: 'star'`). `isStarColumn()` checks all three shapes for safety.
- `CROSS JOIN` is **mis-parsed** as `{ as: 'CROSS', join: 'INNER JOIN', on: null }` — the parser eats "CROSS" as an alias. So the cartesian rule detects "join with no `on`" rather than `join === 'CROSS JOIN'`; this also catches comma-joins (`FROM a, b` → second table has no `on`).
- `NOT IN (subquery)` wraps the subquery in an `expr_list` whose single element carries an `ast` property; the rule keys off that.
- Scalar subqueries in SELECT appear as `column.expr.ast` (a select AST) with `parentheses: true`.
- `COUNT(*)` is `{ type: 'aggr_func', name: 'COUNT', args: { expr: { type: 'star', value: '*' } } }`.
- Implicit-cast rule only flags columns whose name matches a numeric pattern (`/(_id|id|count|num|qty|amount|price|total|score|…)$/i`) compared to a string literal — avoids false positives on legitimate string columns like `code`.
- PlaceholderPage is now fully removed from routing; all 6 tool routes (/, /format, /execution-flow, /erd, /explain-plan, /optimize) are live. The `*` catch-all redirects to Home.
- Index chunk grew to 178KB/56KB-gz (rules + panel in main chunk). Pre-existing lint warnings remain in `button.tsx`, `FormatOptionsPanel.tsx`, `tailwind.config.ts` (untouched).

**To verify:** `npm run typecheck`, `npm run build`. Then `npm run dev` → `/optimize` → "Sample" → click findings to highlight → "Apply fix" on the DISTINCT/cast findings.

---

## QA Sprint: Full App Verification ✅

**Status:** All 5 MVP features verified end-to-end. 2 real bugs found and fixed. Logic suite: 82/82 assertions pass. Browser smoke test (Playwright/Chromium): all 6 routes + 4 interactive flows render with **zero page errors and zero console errors**.

**Method:**
1. **Logic test suite** (82 assertions across all 5 phases, bundled via esbuild + node): formatter, clause splitter + execution-ordering, ERD extractor (DDL/ALTER/INDEX/lineage/inference), plan parser (JSON/text/heat/findings), and all 12 optimizer rules — each with edge cases (empty input, syntax errors, non-SELECT, missing clauses, non-ANALYZE plans, deep nesting, false-positive guards).
2. **Browser smoke test** (Playwright + Chromium against `vite preview` build): navigated every route, captured `pageerror` + console errors, loaded each feature's sample, and verified React Flow node/edge counts, finding-card counts, and the Apply-fix interaction. Verified cross-route store persistence (sqlStore survives home → /optimize navigation) and the format page's dual-Monaco layout.

**Bugs found & fixed:**
- **`parsePlan.ts` — non-ANALYZE plans showed green heat everywhere.** `node.timeShare` was set to `0` (instead of `undefined`) for plans with no actual times, turning every node's heat bar emerald. Root cause: `exclusiveTime` computed as `max(0, 0-0)=0` even without timing, then `timeShare = 0/total*100 = 0`. **Fix:** guard `timeShare` on `root.actualTotalTime != null` so non-ANALYZE nodes get neutral (undefined) heat.
- **`rules.ts` — ORDER BY+LIMIT rule fired without a LIMIT.** `node-sql-parser` always sets `ast.limit = { seperator: "", value: [] }` (empty value array) even when there's no LIMIT clause, so `!ast.limit` was always false. **Fix:** check `ast.limit?.value?.length > 0` instead of truthiness of `ast.limit`.

**Browser smoke results (all clean):**
| Route / flow | Result |
|---|---|
| `/`, `/format`, `/execution-flow`, `/erd`, `/explain-plan`, `/optimize` | 0 page errors, 0 console errors each |
| ERD "Sample DDL" | 4 nodes, 3 edges rendered |
| Explain-plan "Sample" | 6 plan nodes rendered |
| Optimize "Sample" | 11 finding cards rendered; Apply-fix mutates SQL (verified via Monaco model diff) |
| Execution-flow (home sample) | 7 flow nodes rendered |
| Cross-route persistence | SQL loaded on home survives navigation to /optimize (1 finding = ORDER BY+LIMIT) |
| Format page | 2 Monaco editors (input + live preview) |

**Note:** Playwright was installed for the smoke test then uninstalled (along with all test scripts/screenshots) to keep the project lean — `package.json` is unchanged from Phase 5. The smoke test is reproducible by re-installing `playwright` and re-running the equivalent script.

**Final verification:** `npm run typecheck` clean · `npm run build` passes · `npm run lint` clean (only the 3 pre-existing warnings in untouched `button.tsx`/`FormatOptionsPanel.tsx`/`tailwind.config.ts`).

---

## Phase 6: AI Deep Explain ✅

**Status:** Complete. Typecheck + build + browser smoke test pass. The full UI flow (settings modal, provider switching, key persistence, enable/disable logic, streaming wiring, error handling) verified in Chromium with zero runtime errors. Live LLM streaming not exercised (no real API key in test env) but the call path + `friendlyError` are wired.

**What was built:**
- `lib/llm/client.ts` — OpenAI-compatible streaming client. `PROVIDERS` map (Groq / OpenAI / OpenRouter) with `baseURL`, suggested models, and a "get a key" link per provider. `streamChat()` uses the `openai` SDK with `dangerouslyAllowBrowser: true` + provider `baseURL`, iterates the streamed deltas via a callback, supports `AbortSignal` for stop. `friendlyError()` maps 401/403/429/model-not-found/network errors to plain-English messages.
- `lib/llm/prompts.ts` — `SYSTEM_PROMPT` (concise SQL-expert persona, markdown rules, no hallucinated schema) + `buildExplainUserMessage(sql, dialect, findings)` (sends the SQL + the heuristic optimizer's findings as context so the LLM anchors on real issues).
- `components/ui/dialog.tsx` — shadcn-style Radix Dialog primitive (Overlay, Content, Header, Footer, Title, Description, close button) — first use of `@radix-ui/react-dialog` in the app.
- `store/uiStore.ts` — non-persisted store with `settingsOpen` flag so any component can open the settings modal.
- `features/ai-explain/SettingsModal.tsx` — provider `<select>`, model input with `<datalist>` suggestions (auto-resets to the new provider's default model on switch), password-style API key field with show/hide, "get a key" link, red disclaimer ("Your API key is stored only in your browser. We are not responsible for any usage charges."), save/cancel. Reads/writes `settingsStore`.
- `features/ai-explain/AiPanel.tsx` — chat-style streaming panel: "Explain this query" button (sends SQL + optimizer findings as context), free-text follow-up input (Enter to send, Shift+Enter for newline), streaming response with a live cursor + "Thinking…" indicator, Stop button (aborts the fetch), clear-conversation, graceful error bubble, no-key banner with "Add key" shortcut. First message uses the rich explain prompt; subsequent messages are plain follow-ups. Conversation history is sent for multi-turn context.
- `pages/AiPage.tsx` at `/ai` — uses the Workbench shell (left = SQL editor, right = AiPanel) so the user's SQL is the context.
- `SettingsModal` mounted once in `AppLayout`. Header gets a gear button (opens settings) + an "AI" nav link (with a Sparkles icon). HomePage's "AI Deep Explain" card now links to `/ai` (was a stale `/optimize` link).
- `vite.config.ts` — added `llm: ['openai']` manualChunk (openai SDK isolated to 139KB/34KB-gz).

**New dep:** `openai` (SDK). `settingsStore` already had `llmProvider`/`llmModel`/`llmApiKey` from Phase 0 — consumed directly.

**Browser smoke results (all clean, 0 errors):**
| Check | Result |
|---|---|
| `/ai` route loads | header + no-key banner render |
| Settings modal (gear button) | opens with red disclaimer visible |
| Provider switch (Groq → OpenAI) | model auto-resets to `gpt-4o-mini` |
| Save fake key | no-key banner disappears (key persisted to settingsStore) |
| Load SQL (home sample) → /ai | "Explain this query" button becomes enabled |

**Notes:**
- The `openai` SDK runs client-side with `dangerouslyAllowBrowser: true`. The key never leaves the browser except to the chosen provider's API. Groq is the default (fast + free tier) per PLAN.md §5.
- Streaming is real: `streamChat` iterates `client.chat.completions.create({ stream: true })` and calls `onDelta` per chunk; the panel appends to a `partial` buffer and renders a blinking cursor. Stop uses `AbortController` + the SDK's `signal` option.
- Multi-turn: the full message history (system + prior turns + new user msg) is sent each call, so follow-up questions have context.
- The first "Explain this query" message is augmented with the optimizer's heuristic findings — the LLM gets both the SQL and the rule-engine output, so it can confirm/expand on the flagged issues rather than re-deriving them.
- Could not exercise a live LLM call in the test environment (no real API key); the error path (`friendlyError`) is wired and the UI degrades gracefully on 401/network/model errors. A user with a real Groq key can verify streaming end-to-end.
- Pre-existing lint warnings remain in `button.tsx`/`FormatOptionsPanel.tsx`/`tailwind.config.ts` (untouched).

**To verify:** `npm run typecheck`, `npm run build`. Then `npm run dev` → `/ai` → gear icon → paste a Groq API key → Save → "Explain this query".

---

## Phase 7: Polish & Ship ✅

**Status:** Complete. Typecheck + build pass. Lint: **0 errors** (fixed the long-standing `tailwind.config.ts` `require()` error; 3 benign `react-refresh` warnings remain, matching the existing codebase pattern). Browser smoke test: all 9 routes render with per-page `<title>`s, zero errors; donation nudge toast fires after 5 sessions; footer links present.

**What was built:**
- **SEO — head-level:** `lib/seo.tsx` (`useSeo` hook sets `document.title` + description + OG/Twitter meta + injects/removes JSON-LD per route; `SrOnlyH1` for accessible/SEO H1s). Each of the 9 pages calls `useSeo` with a unique title + description. `index.html` got default OG/Twitter tags, `theme-color`, canonical URL, and a static `WebApplication` JSON-LD.
- **SEO — content:** Home page gained a comprehensive 9-question FAQ section + **`FAQPage` JSON-LD** (rich-snippet eligible), shared via `lib/faqData.ts`. New `/faq` route consolidates all FAQs. A 3-card **sample-query gallery** on the home page (analytics query / schema DDL / query-to-optimize) loads SQL + navigates to the right tool.
- **Sitemap & robots:** `public/sitemap.xml` (9 URLs) + `public/robots.txt`.
- **Donation widgets:** New `/support` page with 3 tier cards (coffee / book / keep-lights-on) linking to BMC + Ko-fi. **5-session nudge toast** (`features/donation/DonationNudge.tsx` + `components/ui/toast.tsx` Radix toast) — counts sessions in localStorage, shows a dismissible "Finding this useful?" toast after 5, with a "Don't show again" opt-out. Mounted in AppLayout. Footer got FAQ / Support / GitHub links.
- **Lighthouse — route code-splitting:** `App.tsx` converted all 9 routes to `React.lazy` + `Suspense`. Result: the **main entry chunk dropped from 222KB/70KB-gz → 114KB/39KB-gz**, and each page is now its own chunk (`ErdPage-*.js`, `ExplainPlanPage-*.js`, etc.). The heavy `parser` (2.6MB), `flow` (408KB), `formatter` (293KB), `llm` (139KB), and `monaco` chunks now load **only when their route is visited** — the landing page no longer pays for them.
- **README.md + LICENSE (MIT)** — full project README (features, stack, scripts, structure, privacy) + MIT license. Also fixed the pre-existing `tailwind.config.ts` `require()` → ESM import.
- **OG image:** `public/og/sql-explainer.svg` (branded 1200×630). Note: SVG OG images aren't rendered by all social platforms — a PNG should be generated for full compatibility before public launch.

**Browser smoke results (all clean):**
| Route | Title set | Content marker | Errors |
|---|---|---|---|
| `/` | ✅ | FAQ + sample gallery | 0 |
| `/format` | ✅ | Formatted output panel | 0 |
| `/execution-flow` | ✅ | Execution order canvas | 0 |
| `/erd` | ✅ | Schema diagram | 0 |
| `/explain-plan` | ✅ | Plan explainer | 0 |
| `/optimize` | ✅ | Optimizer empty-state | 0 |
| `/ai` | ✅ | AI panel | 0 |
| `/faq` | ✅ | FAQ list | 0 |
| `/support` | ✅ | Tier cards | 0 |
| Nudge toast | — | fires after 5 sessions | 0 |
| Footer | — | FAQ + Support links | 0 |

**Notes:**
- The 3 remaining lint warnings are all `react-refresh/only-export-components` (button.tsx, FormatOptionsPanel.tsx, seo.tsx) — a known shadcn/ui pattern, benign, doesn't affect production.
- Lighthouse not run in this env (no Chrome DevTools/Lighthouse CLI), but the lazy-splitting + lean landing page (no parser/monaco/flow on `/`) is the high-impact change. A real Lighthouse run on the deployed URL is the final gate.
- OG image is SVG (some platforms need PNG) — generate a PNG before "Show HN".
- Per-page visible FAQ accordions were scoped to the home + `/faq` pages rather than every tool page (tool pages stay full-bleed app UI); head-level SEO + sr-only H1 still apply per route.
- Per PLAN.md §13 open decisions: domain assumed `sql-explainer.vercel.app` (placeholder in canonical/sitemap/OG); BMC/Ko-fi handles are placeholder URLs; analytics still TBD (recommend Cloudflare Web Analytics at deploy time).

**To verify:** `npm run typecheck`, `npm run build`, `npm run lint`. Then `npm run dev` → `/` (FAQ + samples) → `/faq` → `/support` → navigate tools (titles update) → revisit 5× for nudge toast.

---

# 🔖 RESUME HERE — Project Handoff

## Current state
**All phases (0–9) complete and verified.** The MVP is feature-complete and hardened: formatter, execution-flow visualizer, ERD, EXPLAIN plan explainer, heuristic optimizer, optional AI deep-explain, accessibility baseline, and **dbt/Jinja templating support (Phase 9)** — all client-side, SEO-ready, donation-monetized, lazy-split for performance, and covered by 89 unit tests. Typecheck clean, build passes, lint 0 errors. Remaining for public launch: deploy to Vercel/Cloudflare Pages, generate a PNG OG image, run a real Lighthouse pass on the deployed URL, and submit to Show HN / r/SQL.

## How to run / verify
```powershell
cd D:\Data\Codes\sql-explainer
npm run typecheck   # tsc -b --noEmit  (must be clean)
npm run build       # tsc -b && vite build
npm run test:run    # vitest run  — 89 tests across 10 files
npm run lint        # eslint . (flat config, 0 errors)
npm run dev         # vite dev server on http://localhost:5173
```
All five pass as of this checkpoint. Node 24 / npm 11 on Windows (pwsh).

## Tech stack & installed versions (see package.json)
- Vite 6 + React 18 + TypeScript 5.7
- Tailwind CSS 3.4 + shadcn/ui-style Radix primitives (Button/Tabs/Select/Dialog in `src/components/ui/`)
- `@monaco-editor/react` 4.6 + `monaco-editor` 0.52 (custom theme `sql-explainer` in `lib/monaco/theme.ts`)
- `@xyflow/react` 12.3 (React Flow v12) — powers execution flow, ERD canvas, plan tree
- `node-sql-parser` 5.3 (multi-dialect AST) — wrapper in `lib/sql/parser.ts`
- `sql-formatter` 15.4 — wrapper in `lib/sql/formatter.ts`
- `openai` SDK (Phase 6) — OpenAI-compatible client (Groq/OpenAI/OpenRouter); isolated in `llm` chunk
- `dagre` (Phase 3) — graph auto-layout for ERD + plan tree
- `html-to-image` (Phase 3) — ERD PNG/SVG export
- `zustand` 5 (with `persist` middleware), `react-router-dom` 6.28, `framer-motion` 11, `lucide-react` 0.468
- **`vitest`** 3 (Phase 8) — unit test runner (jsdom env, Vitest UI-ready)

## Project structure (as of now)
```
src/
├── components/
│   ├── editor/SqlEditor.tsx        # Monaco input; registers into editorStore
│   ├── layout/{AppLayout,Header,Footer,Workbench}.tsx
│   └── ui/{button,tabs,select,dialog,toast}.tsx
├── features/
│   ├── formatter/FormatOptionsPanel.tsx
│   ├── execution-flow/{ExecutionFlow,FlowNode,DataPreview}.tsx
│   ├── erd/{ErdCanvas,ErdDetailsPanel,TableNode,erdLayout,erdExport,erdExplain}.tsx
│   ├── query-plan/{PlanTree,PlanNodeView}.tsx
│   ├── optimizer/OptimizerPanel.tsx
│   ├── ai-explain/{AiPanel,SettingsModal}.tsx
│   └── donation/DonationNudge.tsx
├── lib/
│   ├── monaco/theme.ts             # registerSqlTheme(monaco), SQL_THEME
│   ├── sql/{parser,formatter,clauseSplitter,executionOrder,erdExtractor,jinja,jinja.e2e}.ts
│   │   └── *.test.ts               # colocated Vitest specs (1:1 with source)
│   ├── queryPlan/parsePlan.ts + .test.ts
│   ├── heuristics/{rules,rules.test}.ts
│   ├── llm/{client,prompts,prompts.test}.ts
│   ├── seo.tsx                     # useSeo hook, SrOnlyH1
│   ├── faqData.ts
│   └── utils/index.ts              # cn(), download(), copyToClipboard()
├── pages/{HomePage,FormatPage,ExecutionFlowPage,ErdPage,ExplainPlanPage,OptimizePage,AiPage,FaqPage,SupportPage}.tsx
├── store/{sqlStore,settingsStore,editorStore,planStore,uiStore}.ts
├── styles/globals.css              # tailwind + CSS vars (dark theme) + a11y
├── types/index.ts                  # Dialect, DIALECTS[], ParseError, Finding
├── App.tsx                         # routes
├── main.tsx
└── vitest.config.ts                # jsdom env, tsconfig paths
```

## Store architecture
- `sqlStore` (persisted, key `sql-explainer-sql`): `sql`, `dialect` (default `postgresql`), `setSql`, `setDialect`, `loadSample`, `clear`.
- `settingsStore` (persisted, key `sql-explainer-settings`): `theme`, `llmProvider` (default `groq`), `llmModel` (default `llama-3.3-70b-versatile`), `llmApiKey`. Consumed by Phase 6 (AI panel + settings modal).
- `editorStore` (NOT persisted): holds live Monaco editor instance + `highlight(start,end)` / `clearHighlight()`. SqlEditor calls `setEditor` on mount.
- `planStore` (persisted, key `sql-explainer-plan`): `planText` for the EXPLAIN paste box (Phase 4).
- `uiStore` (NOT persisted): `settingsOpen` flag — opens the AI settings modal from anywhere (Phase 6).

## node-sql-parser AST shape (critical for Phase 3 + 5)
A SELECT AST (from `parser.astify(sql, { database: 'PostgreSQL' })`, wrapped in `lib/sql/parser.ts` `parseSql()` which returns `{ ok, ast, error }` and normalizes to an array):
```
{
  with: null | [{ name, stmt: { ast } }],          // CTEs
  type: 'select',
  distinct: { type: null } | { type: 'DISTINCT' },
  columns: [ { type:'expr'|'star', expr, as } ],   // expr.column.expr.value = name
  from: [ { table, as, join?, on? } ],             // first = base; rest have join:'INNER JOIN' etc + on
  where: { type:'binary_expr', operator, left, right },
  groupby: { columns: [...] },
  having: { ... },
  orderby: [ { expr, type:'ASC'|'DESC', nulls } ],
  limit: { seperator, value:[{type:'number',value}] },
  window: null
}
```
Column ref: `{ type:'column_ref', table, column:{ expr:{ type:'default', value:'name' } } }`. Use `colName()` helper in `executionOrder.ts` (already written — reuse/copy it for Phase 3 & 5).
Aggregates: `{ type:'aggr_func', name:'SUM', args:{ expr } }`. Use `collectAggregates()`.

**Note:** `node-sql-parser` is CommonJS; in ESM import via default: `import pkg from 'node-sql-parser'; const { Parser } = pkg`. In app code (`lib/sql/parser.ts`) it's already wrapped — just call `parseSql(sql, dialect)`.

## sql-formatter v15 API (gotcha)
Real `FormatOptions` (from `node_modules/sql-formatter/dist/esm/FormatOptions.d.ts`): `tabWidth, useTabs, keywordCase, identifierCase, dataTypeCase, functionCase, indentStyle ('standard'|'tabularLeft'|'tabularRight'), logicalOperatorNewline ('before'|'after'), expressionWidth, linesBetweenQueries, denseOperators, newlineBeforeSemicolon`. **There is NO `commaPosition` or `newlineBeforeOpenParen` in v15** (older docs lie). Dialect strings: `postgresql, mysql, mariadb, sqlite, transactsql, bigquery, snowflake, redshift, db2, sql`.

## PLAN.md vs reality
The `PLAN.md` (root) has the full spec. **All phases (0–8) ✅ done.** Per-phase plan:
- **Phase 3 — ERD ✅ DONE:** `lib/sql/erdExtractor.ts` (DDL + SELECT lineage + naming-heuristic inference), `features/erd/{ErdCanvas,TableNode,erdLayout,erdExport}.tsx`, `pages/ErdPage.tsx` at `/erd`. New deps: `dagre`, `@types/dagre`, `html-to-image`. Per-column invisible handles for dbdiagram-style edges; solid=explicit, dashed-amber=inferred. Exports: DBML text + PNG/SVG via html-to-image.
- **Phase 4 — Plan Explainer ✅ DONE:** `lib/queryPlan/parsePlan.ts` (PostgreSQL JSON + text parser, exclusive-time heat, bottleneck detection), `features/query-plan/{PlanTree,PlanNodeView}.tsx`, `pages/ExplainPlanPage.tsx` at `/explain-plan`. New `planStore` (separate from sqlStore). Custom paste-box layout (not Workbench). Tabs: Tree / Findings / Narrative. Heat uses self/exclusive time so the real bottleneck surfaces instead of the root.
- **Phase 5 — Optimizer ✅ DONE:** `lib/heuristics/rules.ts` (12 rules, try/catch-isolated), `features/optimizer/OptimizerPanel.tsx` (severity-sorted list + click-to-highlight via editorStore + Apply-fix for rewrites), `pages/OptimizePage.tsx` at `/optimize`. `Finding` type extended with `snippet`/`startOffset`/`endOffset`. PlaceholderPage fully removed — all 6 tool routes live. See Phase 5 notes for `node-sql-parser` v5.3 AST quirks.
- **Phase 6 — AI Explain ✅ DONE:** `lib/llm/{client,prompts}.ts` (OpenAI-compatible streaming via `openai` SDK, Groq/OpenAI/OpenRouter, `friendlyError`), `features/ai-explain/{AiPanel,SettingsModal}.tsx`, `pages/AiPage.tsx` at `/ai`, `components/ui/dialog.tsx` (Radix), `store/uiStore.ts` (modal open state). Settings modal mounted in AppLayout; Header gear button + AI nav link. Streaming chat with Stop (AbortController), multi-turn history, optimizer-findings-augmented first prompt, red key disclaimer. New dep: `openai`. Browser-smoke-tested (0 errors).
- **Phase 7 — Polish & Ship ✅ DONE:** `lib/seo.tsx` (`useSeo` hook + `SrOnlyH1`) applied to all 9 routes; `index.html` OG/Twitter/canonical/theme-color/`WebApplication` JSON-LD; home FAQ + `FAQPage` JSON-LD (`lib/faqData.ts`); `/faq` + `/support` pages; `public/{sitemap.xml,robots.txt}`; `features/donation/DonationNudge.tsx` (5-session Radix toast) + `components/ui/toast.tsx`; `React.lazy` route splitting (entry chunk 222KB→114KB/39KB-gz; parser/monaco/flow/llm deferred to their routes); `README.md` + `LICENSE` (MIT); `public/og/sql-explainer.svg`; fixed pre-existing `tailwind.config.ts` `require()` error. Browser-smoke-tested (0 errors). Lint: 0 errors.
- **Phase 8 — Hardening + Accessibility ✅ DONE:** See below.

## Known gotchas
- `npm create vite` interactive prompt cancels in this environment — scaffold manually (already done).
- Dev server is long-running (blank cmd is normal); kill leftover node processes with `Get-Process node | Stop-Process -Force`.
- `node-sql-parser` chunk is 2.6MB/515KB-gz — code-split via `manualChunks` already; consider dynamic `import()` if Lighthouse complains.
- Monaco theme must be registered via both `beforeMount` and `onMount` for multiple editor instances to pick it up (done in `SqlEditor` + `FormatPage`'s read-only editor).
- React Flow v12 attribution is hidden via `proOptions={{ hideAttribution: true }}` — revisit licensing if commercializing.
- `tsconfig.app.json` has `noUnusedLocals` + `noUnusedParameters` strict — remove unused imports after each edit or typecheck fails.
- **`node-sql-parser` always sets `ast.limit = { seperator: "", value: [] }`** (empty value array) even when there's no LIMIT clause — never truthiness-check `ast.limit`; check `ast.limit?.value?.length > 0`. (Found in QA sprint; the order-by-limit rule was the victim.)
- **`node-sql-parser` `CROSS JOIN` is mis-parsed** in PostgreSQL mode as `{ as: 'CROSS', join: 'INNER JOIN', on: null }` — the cartesian-join optimizer rule detects "join with no `on`" instead of `join === 'CROSS JOIN'`. See Phase 5 notes.
- **`SELECT *` parses as `column: "*"` (string)** in v5.3, not `{ type: 'star' }` — `isStarColumn()` in `rules.ts` checks all three shapes. See Phase 5 notes.
- **EXPLAIN non-ANALYZE plans have no actual times** — `parsePlan` guards heat (`timeShare = undefined`) so nodes render neutral instead of falsely green. (Found & fixed in QA sprint.)

## Open decisions still pending (from PLAN.md §13)
- [ ] Default dialect priority (recommend: PostgreSQL-first — already the default)
- [ ] BMC vs Ko-fi handle / username
- [ ] Repo name & license (recommend: MIT)
- [ ] Domain name (optional — `*.vercel.app` works for MVP)
- [ ] Analytics: Plausible self-hosted or Cloudflare Web Analytics (free, privacy-friendly)

---

## Phase 8: Hardening & Accessibility ✅

**Status:** Complete. Typecheck clean, build passes, lint 0 errors, 58 tests across 8 files all pass. All Phase 8 fixes target real correctness bugs or practical a11y gaps — no speculative refactors.

### Milestones

#### M0 — Vitest harness
- Installed `vitest` 3 + `jsdom` 25, created `vitest.config.ts` with tsconfig paths alias.
- Added `test:run` (one-shot) and `test` (watch) scripts to `package.json`.
- Added sanity tests for `parser.ts` (empty string, valid SQL, syntax error, parse/ast normalization).
- Updated `AGENTS.md` with Vitest commands, test conventions, and `tsconfig.node.json` update.
- **Documents:** `vitest.config.ts`, `src/lib/sql/parser.test.ts`.
- **Verification:** `npm run test:run` → 4 parser tests pass.

#### M1 — `rules.ts` cursor-based `makeLocator()` (H1/H2/H3)
- **Bug:** Global `locate()` used `sql.split('\n')` which broke on multi-line strings, comments, and paren-balanced multi-line expressions. Offsets were line-column based (parseable but fragile across minification).
- **Fix:** Replaced with `makeLocator(sql)` — returns a closure over a single linear `scanIndex`. Walks the SQL char-by-char tracking paren depth + string/comment state. Each `locate(substring)` call resets `scanIndex` and does one forward `indexOf` scan from position 0. Returns `{ startOffset, endOffset }` or `null`. Added `isCountStar()` / `hasCountStarCompareZero()` helpers; conservative count-star-exists rule (bare `SELECT COUNT(*)` + WHERE; `HAVING COUNT(*) > 0`); regex escaping for snippet content.
- **Tests:** 15 rules tests cover all 12 rules with sample SQL — every finding has the correct offset.
- **Files:** `src/lib/heuristics/rules.ts` + `rules.test.ts`.

#### M2 — `formatter.ts` string-aware `collapseForMinify()` (C1)
- **Bug:** `minifySql()` was a placeholder that trimmed whitespace but didn't preserve string content.
- **Fix:** `collapseForMinify(sql)` walks char-by-char, tracking string delimiters (`'`, `"`, backtick, `$`-tagged dollar-quoting) and collapses runs of whitespace/newlines outside strings to single spaces.
- **Tests:** 6 formatter tests cover normal SELECT, multi-line strings, dollar-quoting, empty input, already-minified, backtick identifiers.
- **Files:** `src/lib/sql/formatter.ts` + `formatter.test.ts`.

#### M3 — `clauseSplitter.ts` `UNION ALL` precedes `UNION` (H4/H5)
- **Bug:** Regex alternation `UNION|UNION ALL` matched `UNION` first, so `UNION ALL` was never matched.
- **Fix:** Sorted clause keywords by length descending before building the regex. Also fixed `fromTableName()` returning `"undefined"` for derived tables (detect `"undefined"` string → `"(subquery)"`).
- **Tests:** 7 splitter tests cover basic SELECT, CTE, UNION, UNION ALL, compound set-ops, subquery, edge cases.
- **Files:** `src/lib/sql/clauseSplitter.ts` + `clauseSplitter.test.ts`, `src/lib/sql/executionOrder.ts` + `executionOrder.test.ts`.

#### M4 — `erdExtractor.ts` composite ON + ALTER TABLE variants (H6/H7)
- **Bug:** Composite AND in ON clause (e.g. `ON a.x = b.x AND a.y = b.y`) produced only the last pair. `ALTER TABLE ... DROP COLUMN`, `DROP CONSTRAINT`, `RENAME TO`, `RENAME COLUMN` were not handled.
- **Fix:** `collectJoinPairs()` walks the ON binary expression tree, collecting all `=` pairs at any depth. `processAlter()` handles `DROP COLUMN` (remove column + its relationships), `DROP CONSTRAINT` (remove FK by label), `RENAME TO` (table rename + update all refs), `RENAME COLUMN` (column rename + update relationships).
- **Tests:** 11 erdExtractor tests cover DDL + 3 ALTER variants + SELECT lineage + inference + empty/error states.
- **Files:** `src/lib/sql/erdExtractor.ts` + `erdExtractor.test.ts`.

#### M5 — Medium-severity fixes (M1/M3/M6/M7/M8)
- **`rules.ts`** — `_next` set-op chaining: The `_next` property on `ast` for UNION/INTERSECT/EXCEPT clauses is now correctly walked so optimizer rules fire on all branches of a compound query.
- **`erdExtractor.ts`** — `defaultTable` for single-table unprefixed columns in WHERE: If the column ref has no table qualifier and only one table is in scope, the extractor now assigns it to that table.
- **`parsePlan.ts`** — closure-local `makeIds()` instead of module-level `idCounter`: Node IDs are now generated by `makeIds()` returned from `parsePlan()`, using a local counter per call, eliminating cross-call ID duplication in tests.
- **`client.ts`** — `max_tokens: 1500`, abort error mapping in `friendlyError`: Sets a reasonable output limit and maps abort errors to a clean user message instead of the raw SDK error.
- **`prompts.ts`** — `MAX_SQL_CHARS = 8000` truncation: SQL passed to the LLM is truncated to 8000 chars to avoid token-limit failures; a note is appended when truncated.
- **`parser.ts`** — empty SQL returns `{ ast: [], ok: false }` instead of throwing.
- **`executionOrder.ts`** — guard for empty AST: returns empty step array instead of crashing.
- **Tests:** Final count 58 tests across 8 files, all pass.

#### M6 — Phase 3 Accessibility (practical a11y)
- **`src/styles/globals.css`**: Added `.skip-link` utility class (hidden offscreen, visible on focus), `@media (prefers-reduced-motion: reduce)` to disable all animations/transitions system-wide.
- **`AppLayout.tsx`**: Added `<a href="#main-content" class="skip-link">` as the first DOM element; `<main>` gets `id="main-content"` + `tabIndex={-1}` for programmatic focus.
- **`Header.tsx`**: `<nav aria-label="Main navigation">`, `aria-current="page"` on active nav link, `aria-label` on settings and GitHub icon buttons.
- **`Workbench.tsx`**: `role="toolbar" aria-label="SQL editor toolbar"` on the editor bar, `aria-label="SQL dialect"` on `<select>`, `role="toolbar" aria-label="Tool navigation"` on tool links, `aria-label="Clear editor"` on clear button.
- **`Footer.tsx`**: `aria-label` on FAQ, Support, and GitHub links.
- **`HomePage.tsx`**: `aria-label` on sample buttons (label + description) and feature cards.
- **`ErdDetailsPanel.tsx`**: ESC key to close, focus trap (Tab cycles within panel), `role="dialog" aria-modal="true"`, auto-focus close button on open.
- **`ExecutionFlow.tsx`**: Segmented view switcher gets `role="tablist"`/`role="tab"`/`aria-selected`; active step indicator gets `aria-live="polite"` for screen reader announcements.

**Verified:** `npm run typecheck`, `npm run lint` (0 errors), `npm run test:run` (58/58), `npm run build` — all pass.

---

### Files changed in Phase 8
```
Added:
  vitest.config.ts
  src/lib/sql/parser.test.ts
  src/lib/sql/formatter.test.ts
  src/lib/sql/clauseSplitter.test.ts
  src/lib/sql/executionOrder.test.ts
  src/lib/sql/erdExtractor.test.ts
  src/lib/heuristics/rules.test.ts
  src/lib/queryPlan/parsePlan.test.ts
  src/lib/llm/prompts.test.ts

Modified:
  src/styles/globals.css                          # skip-link, prefers-reduced-motion
  src/components/layout/AppLayout.tsx              # skip link, main id+tabindex
  src/components/layout/Header.tsx                 # aria-label, aria-current
  src/components/layout/Workbench.tsx               # toolbar roles + aria-labels
  src/components/layout/Footer.tsx                 # aria-labels on links
  src/pages/HomePage.tsx                           # aria-labels on samples + cards
  src/features/erd/ErdDetailsPanel.tsx             # ESC + focus trap + role=dialog
  src/features/execution-flow/ExecutionFlow.tsx    # tab roles + aria-live
  src/lib/sql/formatter.ts                         # collapseForMinify()
  src/lib/sql/clauseSplitter.ts                     # UNION ALL regex order
  src/lib/sql/executionOrder.ts                     # fromTableName() guard
  src/lib/sql/erdExtractor.ts                       # collectJoinPairs(), processAlter()
  src/lib/heuristics/rules.ts                       # makeLocator(), count-star helpers
  src/lib/queryPlan/parsePlan.ts                    # makeIds() closure
  src/lib/llm/client.ts                             # max_tokens, abort mapping
  src/lib/llm/prompts.ts                            # MAX_SQL_CHARS truncation
  src/lib/sql/parser.ts                             # empty SQL guard
  AGENTS.md                                         # Vitest commands, test conventions
  package.json                                      # vitest devDeps + test scripts
  tsconfig.node.json                                # vitest.config.ts include
```

---

## Phase 9: dbt / Jinja Templating Support ✅

**Status:** Complete. Typecheck clean, build passes, lint 0 errors, **89 tests across 10 files** all pass. The app now accepts dbt models (Jinja-templated SQL) in addition to plain SQL across every Workbench tool.

**What was built:**
- **`lib/sql/jinja.ts`** (new, no deps) — hand-rolled Jinja preprocessor. The core of the feature.
  - `hasJinja(sql)` — cheap substring gate (`{{` / `{%` / `{#`).
  - `stripJinja(sql)` → `{ stripped, regions, refs, vars, warnings, strippedToOriginal, originalToStripped }`. A SQL-lexical state machine (tracks `'`/`"`/`--`/`/* */`) detects tags **only in normal state** — Jinja inside SQL string literals is left verbatim (correct: `'{{ var("d") }}'` is valid SQL text). For each tag:
    - **Smart placeholders:** `ref('x')`→`x`, `ref('pkg','m')`→`m`, `source('s','t')`→`t`, `var('n','d')`→`d` (number/bool/string-default preserved), `var('n')`→`NULL`, bare literal→itself, `config(...)`→empty, unknown→`NULL` + warning. Collects `refs[]`/`vars[]` for UI + LLM.
    - **Control blocks:** `{% if %}...{% endif %}`, `{% for %}...{% endfor %}`, macro/block/raw are dropped **including their bodies** via `findControlBlockEnd` (nesting-aware) — removing only the markers would leave malformed SQL (e.g. an orphaned `WHERE`). `{% set %}`/`{# #}` are removed as single tags.
  - `remapToOriginal(r, strippedOffset)` / `remapToStripped(r, originalOffset)` — the offset bridge (binary-search-free O(1) array lookup).
  - `formatAroundJinja(sql, formatFn, {compact?})` — format-around: strip → format stripped → tokenize both (SQL-aware tokenizer) → align 1:1 (normalized for keyword-case) → re-insert `{{ }}` at placeholder positions and `{% set %}`/`{# #}` on their own lines; control-block regions are skipped (stay dropped). Falls back to a commented stripped preview if token alignment diverges.
- **`lib/sql/parser.ts`** — `parseSql` strips Jinja before `parser.astify`. `ParseResult` gained `jinja: JinjaMeta { detected, refs, vars, warnings }`. When Jinja is detected, syntax-error `line`/`column` are cleared (they index the stripped string, so would mislead).
- **`lib/sql/clauseSplitter.ts`** — added a Jinja-skip state (mirrors the string/comment states via `findTagClose`). Scanner now skips tags in-place → emits **original-space offsets** directly (no remap needed downstream). Segment text includes real dbt tags.
- **`lib/sql/formatter.ts`** — `formatSql`/`minifySql` route through `formatAroundJinja`; `collapseForMinify` gained Jinja-skip awareness so reinserted tags aren't corrupted on the minify post-pass.
- **`lib/heuristics/rules.ts`** — `runHeuristics` strips once, runs each rule's `makeLocator` over the **stripped** SQL, then remaps every `Finding.startOffset/endOffset` back to original space and re-slices `snippet` from the original dbt text. Plain-SQL path is identity (no jinja). Optimizer "Apply" (`sql.replace(snippet, rewrite)`) still works because snippets now come from the editor's raw text.
- **`lib/llm/prompts.ts`** — `buildExplainUserMessage` sends the **stripped** SQL with an appended dbt annotation (refs/vars/unresolved count) so the LLM reasons about real SQL. `SYSTEM_PROMPT` got a dbt-awareness clause.
- **`components/layout/Workbench.tsx`** — renders an indigo **"dbt" badge** (Braces icon) next to the Valid/Error chip when `parse.jinja.detected`; tooltip shows discovered refs.
- **`pages/HomePage.tsx`** — 4th sample card ("dbt model (Jinja)") loading a realistic model with `config()`/`ref()`/`var()`/`{% if %}`.

**Verified end-to-end (`jinja.e2e.test.ts`):** the HomePage dbt sample parses (ok, refs=[stg_events], vars=[revenue_threshold]); optimizer findings all have non-empty original-space snippets; format output reinserts `{{ ref('stg_events') }}` + `{{ safe_divide(...) }}`, drops the `{% if is_incremental() %}` block, and keeps the compiled SQL; minify preserves `{{ var('revenue_threshold', 100) }}`; clause-splitter offsets map back to the raw dbt text.

**Offset strategy (the hardest constraint):** the Monaco editor displays the **raw dbt text**, and `editorStore.highlight()` uses `model.getPositionAt(offset)`. So every offset must index the original dbt string. Solved two ways:
- Char-scanner (`clauseSplitter`) → made Jinja-aware → emits original-space offsets with zero remap.
- Regex-scanner (`rules.makeLocator`) → scans stripped SQL, then remapped via `remapToOriginal` + snippet re-sliced from original.

**Known limitations (documented as `warnings`):**
- `{% if %}...{% endif %}` / `{% for %}` bodies are **dropped** (the full-refresh / non-incremental path). True Jinja compilation is impossible client-side (dbt needs the project graph: other models for `ref()`, macros, packages like `dbt_utils`, var defaults).
- Unknown `{{ expr }}` (macros, package calls) → `NULL` placeholder + warning.
- Jinja **inside SQL string literals** is intentionally preserved verbatim (it's valid SQL text; stripping would corrupt the literal).

**Files changed in Phase 9:**
```
Added:
  src/lib/sql/jinja.ts                # core preprocessor + formatAroundJinja + tokenizer
  src/lib/sql/jinja.test.ts           # 23 tests
  src/lib/sql/jinja.e2e.test.ts       # 1 integration test (parser+rules+formatter+splitter)

Modified:
  src/lib/sql/parser.ts               # stripJinja + JinjaMeta on ParseResult
  src/lib/sql/clauseSplitter.ts       # Jinja-skip state (findTagClose)
  src/lib/sql/formatter.ts            # formatAroundJinja + collapseForMinify Jinja-skip
  src/lib/heuristics/rules.ts         # scan stripped + remap offsets/snippets
  src/lib/llm/prompts.ts             # stripped SQL + dbt annotation
  src/components/layout/Workbench.tsx # dbt badge
  src/pages/HomePage.tsx              # dbt sample card
  src/lib/sql/parser.test.ts          # +3 dbt tests
  src/lib/sql/clauseSplitter.test.ts  # +2 dbt tests
  src/lib/heuristics/rules.test.ts    # +2 dbt tests
```

**To verify:** `npm run typecheck`, `npm run test:run` (89/89), `npm run build`. Then `npm run dev` → Home → "dbt model (Jinja)" sample → note the "dbt" badge → Execution flow renders → Optimize → click a finding → highlight lands on the right line in the **raw templated** text → Format reinserts the `{{ }}` tags.

---

## Per-CTE Execution Flow ✅

**Status:** Complete. Typecheck clean, build passes, lint 0 errors, **139 tests across 13 files** all pass.

**What was built:**
- `FlowStep` gained an optional `cte?: string` field tagging each step's scope (which CTE it belongs to, or undefined for the main query).
- `buildExecutionFlow` (in `lib/sql/executionOrder.ts`) was refactored: the per-SELECT step-building logic was extracted into a reusable `buildSelectFlow(segments, ast, dialect, cte)` helper. A new `extractCteBodies(withSegment, ast)` does a paren-balanced, string/comment-aware scan of the `WITH` region to find each CTE body's offsets in the original SQL, then `buildExecutionFlow` builds a per-CTE flow (via `buildSelectFlow`) for each CTE before the main query. Step offsets are remapped to original-SQL space so editor highlighting lands correctly. Recursive/set-op CTEs (`WITH RECURSIVE`, CTE bodies with UNION) are skipped gracefully — they produce no steps and don't crash.
- `buildSnapshots` (in `lib/sql/dataTransform.ts`) was extended to walk the flat step list grouped by `cte` scope. Each scope is seeded from real tables (`buildSourceTable`) OR, when the CTE's FROM references an earlier CTE, from that earlier CTE's final WorkState — so a CTE-of-CTE chain carries data forward visually. Unvisualizable scopes emit `null` snapshots. The `SnapshotResult.snapshots` type widened to `(TableSnapshot | null)[]`. When the main query's FROM is a CTE (the common case), `mainSource` is synthesized from the main scope's seeded state.
- `FlowNode.tsx` shows an indigo scope chip (Braces icon) on each step card when `step.cte` is set, so the pipeline reads clearly as cte_a → cte_b → main.
- `DataPreview.tsx` groups its step pills by scope (shows a `cte name` / `main` label when scope changes), disables pills whose snapshot is null, and renders a friendly "no preview available for this scope" state instead of crashing for unvisualizable scopes.
- New test file `src/lib/sql/dataTransform.test.ts` (4 tests); `executionOrder.test.ts` gained per-CTE tests (offset remapping, id uniqueness, recursive-CTE skip).

**Verified:** `npm run typecheck` (clean), `npm run test:run` (139/139), `npm run lint` (0 errors, 3 pre-existing react-refresh warnings), `npm run build` (passes). Manual browser smoke is the user's to run (`npm run dev` → `/execution-flow` → load a multi-CTE query → Play walks cte-by-cte; hover a CTE step highlights the right lines in the editor; Data tab shows rows flowing through CTEs).

**Notes:**
- Limitation: recursive/UNION CTEs and CTEs whose bodies can't be modeled by the mock-data engine are skipped gracefully (no per-clause steps, `null` snapshots). Subqueries/derived tables are still not expanded into sub-flows (same gap as before, out of scope).
- The `node-sql-parser` CTE AST access path: single-statement CTEs store the SELECT AST directly on `cte.stmt` (no `.ast` wrapper); normalize via `cte.stmt?.ast ?? cte.stmt`.
- Design doc: `docs/superpowers/specs/2026-07-12-per-cte-execution-flow-design.md`. Implementation plan: `docs/superpowers/plans/2026-07-12-per-cte-execution-flow.md`.
