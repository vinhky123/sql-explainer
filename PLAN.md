# SQL Explainer — Build Plan

> A free, client-side, developer-grade SQL workbench that turns raw SQL into understanding. Paste SQL → get formatted code, a visual execution-order flow, an interactive ERD, an EXPLAIN-plan breakdown, and heuristic optimization tips. Monetized via voluntary donations. Zero backend, zero operating cost.

---

## 1. Vision

A **free, client-side, developer-grade SQL workbench** that turns raw SQL into understanding. Users paste SQL and instantly get: formatted code, a visual execution-order flow, an interactive ERD, an EXPLAIN-plan breakdown, and heuristic optimization tips. Monetized via voluntary donations (Buy Me a Coffee / Ko-fi). Zero backend, zero operating cost, ships to Vercel/Cloudflare Pages free tier.

**North-star metric:** time-to-insight — from paste to "ah, now I understand this query" in under 5 seconds.

**Audience:** developers, DBAs, data analysts, students learning SQL, anyone debugging a slow query.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Vite + React 18 + TypeScript** | Pure client-side SPA; Vite is faster & simpler than Next.js when no SSR/API routes needed |
| Styling | **Tailwind CSS 3 + shadcn/ui (Radix)** | Modern dark dev-tool aesthetic, accessible primitives |
| Editor | **Monaco Editor** (`@monaco-editor/react`) | VS Code-grade editing, built-in SQL tokenizer, minimap |
| SQL parsing | **`node-sql-parser`** | Multi-dialect AST (MySQL/PG/T-SQL/BigQuery/Snowflake), mature |
| Formatting | **`sql-formatter`** | Same author ecosystem, dialect-aware |
| Graph viz | **`@xyflow/react`** (React Flow v12) | Interactive nodes/edges, pan/zoom — powers both ERD & execution flow |
| Layout (graphs) | **`dagre`** | Auto-layout for ERD canvas |
| State | **Zustand** | Lightweight, no boilerplate, works across panels |
| Routing | **React Router v6** | One route per tool (SEO + shareable) |
| Animation | **Framer Motion** | Flow step-through animation, panel transitions |
| Icons | **lucide-react** | Clean, consistent |
| LLM (optional) | **`openai` SDK w/ user-supplied key** | Works with OpenAI/Groq/OpenRouter (OpenAI-compatible) |
| Deploy | **Vercel** (or Cloudflare Pages) | Free, fast CDN, custom domain later |
| Fonts | **Inter** (UI) + **JetBrains Mono** (SQL) | Modern dev-tool feel |

---

## 3. Project Structure

```
sql-explainer/
├── public/
│   ├── favicon.svg
│   └── og/                     # per-tool Open Graph images
├── src/
│   ├── components/
│   │   ├── editor/             # Monaco wrapper, dialect picker, error overlay
│   │   ├── visualizers/        # ExecutionFlow, ERDCanvas, PlanTree
│   │   ├── panels/             # Output panels, findings list, AI chat
│   │   ├── layout/             # Header, Sidebar, DonationWidget, Footer
│   │   └── ui/                 # shadcn/ui primitives (button, dialog, tabs…)
│   ├── features/
│   │   ├── formatter/          # Format options + actions
│   │   ├── validator/          # Parse error overlay
│   │   ├── execution-flow/     # AST → ordered clauses
│   │   ├── erd/                # DDL/lineage → graph
│   │   ├── query-plan/         # EXPLAIN parser → tree
│   │   ├── optimizer/          # Heuristic rules engine
│   │   └── ai-explain/         # Optional LLM panel
│   ├── lib/
│   │   ├── sql/                # parse(), dialect detection, AST utils
│   │   ├── heuristics/         # Rule registry, severity types
│   │   ├── llm/                # Provider client, prompt builders
│   │   └── utils/              # cn(), download, clipboard, storage
│   ├── store/                  # zustand: sqlStore, settingsStore, historyStore
│   ├── hooks/
│   ├── types/
│   ├── styles/globals.css
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── PLAN.md
```

---

## 4. Feature Specs (MVP)

### 4.1 SQL Formatter
- **Input:** editor or paste box.
- **Options:** dialect (MySQL/PostgreSQL/T-SQL/BigQuery/Snowflake/Redshift), indent (2/4/tab), keyword case (upper/lower/preserve), line width, comma placement (after/before), newlines around operators.
- **Output:** live preview, copy button, diff highlight vs input, minify toggle.
- **Lib:** `sql-formatter`.

### 4.2 Syntax Validator / Debugger (foundational)
- Runs `node-sql-parser.parser(...)` on every keystroke (debounced 150ms).
- Success → green badge "Valid (dialect)".
- Failure → red badge + inline squiggly in Monaco + a card showing message, line, column, and a heuristic fix suggestion (e.g., "Missing closing parenthesis near line 4").
- This parse result (AST) feeds all other features.

### 4.3 Execution Order Visualizer
- **Logic:** from AST, extract clauses and reorder to **logical execution order**:
  1. `FROM` + `JOIN`s (resolve tables)
  2. `WHERE` (filter rows)
  3. `GROUP BY` (aggregate)
  4. `HAVING` (filter groups)
  5. `SELECT` (project, incl. window functions)
  6. `DISTINCT`
  7. `ORDER BY`
  8. `LIMIT` / `OFFSET`
- **UI:** vertical React Flow pipeline. Each node = a clause card with:
  - clause name + icon
  - the exact SQL snippet (syntax-highlighted)
  - one-line plain-English "what this does"
  - estimated row-count direction (narrows / same / expands)
- **Interactions:** "Play" button animates step-by-step; click a node to highlight its code in the editor; CTEs/subqueries render as collapsible nested sub-flows.
- **Edge cases:** `UNION`/`INTERSECT` shown as parallel branches; subqueries in SELECT shown as side notes.

### 4.4 ERD / Schema Diagram
- **Inputs supported:**
  - DDL: `CREATE TABLE`, `ALTER TABLE` (add FK), `CREATE INDEX`
  - Query lineage: any `SELECT` → shows tables & columns referenced + joins
- **Extraction:**
  - Tables, columns (name, type, nullable, default, PK, FK, unique)
  - Relationships from explicit FKs **and** naming heuristics (`user_id` → `users.id`, `order_id` → `orders.id`)
- **UI:** React Flow canvas with custom table nodes (header + column rows, PK badge, type chip). Edges connect FK→PK. Auto-layout with `dagre` (bundled).
- **Interactions:** drag/zoom/pan, click column to highlight all its edges, multi-select & delete, **export PNG/SVG**, **export as dbdiagram.io DBML**.
- **Sidebar:** table detail inspector, sample `INSERT` preview if detected.

### 4.5 Query Plan Explainer
- **Input:** paste `EXPLAIN (ANALYZE, FORMAT JSON)` output, OR raw text plan (Postgres/MySQL/T-SQL).
- **Parse:**
  - Postgres JSON → tree of nodes (each: type, cost, rows, actual_time, loops)
  - Text plans → regex/indent parser into same tree shape
- **UI:** React Flow tree (vertical), each node card shows:
  - operation icon (seq scan / index scan / join type / sort / aggregate…)
  - cost bar, rows, actual ms, % of total
  - color heat by time share (green→yellow→red)
- **Bottleneck detection:** flag the slowest node, sequential scans, nested loops with high loops count, sort/spill warnings, high row estimates vs actuals (stale stats).
- **Plain-English panel:** walking narrative: "The planner chose a sequential scan on `orders` (~1.2M rows) costing 423ms — an index on `orders.customer_id` would likely turn this into an index scan."

### 4.6 Performance Optimizer
- **Heuristic rules engine** over the AST. Each rule: `{ id, severity, title, explanation, suggestion, rewrite? }`.
- **Initial rules:**
  1. `SELECT *` → list explicit columns
  2. `LIKE '%x'` leading wildcard → no index can help
  3. Function on indexed column in WHERE (`DATE(created_at) = ...`) → sargability violation
  4. Implicit type cast in join (`ON id = '5'`)
  5. `OR` across columns → suggest `UNION` or composite index
  6. Cartesian product (CROSS JOIN with no ON)
  7. Correlated subquery in SELECT → suggest JOIN
  8. `NOT IN (subquery)` with NULLs → suggest `NOT EXISTS`
  9. `DISTINCT` immediately after `GROUP BY` → redundant
  10. `ORDER BY ... LIMIT` without supporting index
  11. Large `IN (...)` list → suggest temp table or JOIN
  12. `COUNT(*)` vs `EXISTS` for existence checks
- **UI:** severity-sorted findings list; click → highlights offending code in editor + shows suggested rewrite in a split view with "Apply" button.

---

## 5. Optional: AI Deep Explain (Phase 6)

- Settings modal: API key (stored **localStorage only**, never sent anywhere except chosen provider), provider (OpenAI / Groq / OpenRouter / Gemini), model.
- "✨ Explain with AI" button on each feature.
- Sends SQL + AST context + the feature's heuristic output as a structured prompt; streams response into a chat-style panel.
- Clear red disclaimer: "Your API key is stored only in your browser. We are not responsible for any usage charges."
- Free-tier-friendly: default provider = Groq (fast + generous free tier).

---

## 6. UX / Layout

- **Header:** logo, dialect selector, theme toggle (dark default), GitHub link, "Buy me a coffee" button (gold, subtle).
- **Left:** Monaco editor with tab bar (Editor | EXPLAIN paste).
- **Right:** tabbed output panel — Format | Execution Flow | ERD | Plan | Optimize | AI.
- **Bottom strip:** status bar (parse status, dialect, char count, last action).
- **Landing (`/`):** hero with the workbench + 3 feature highlights + sample queries to try (one click loads).
- **Per-tool routes:** `/format`, `/execution-flow`, `/erd`, `/explain-plan`, `/optimize` — each deep-linkable & SEO-indexable.
- **Responsive:** desktop-first (power users), but editor + one output panel works on tablet.
- **Aesthetic:** zinc-950 bg, subtle radial gradient, indigo/emerald accents, glassmorphism cards, monospace for SQL, Inter for UI, 8px radius, soft shadows, 200ms transitions.

---

## 7. Monetization

- **Buy Me a Coffee** floating button (bottom-right, non-blocking, dismissible per session).
- **Ko-fi** widget on `/support` page with tiers ("Buy me a coffee ☕", "Sponsor a database book 📚", "Keep the lights on 💡").
- **Gentle nudge:** after 5 unique sessions (localStorage counter), show a one-time toast: "Finding this useful? A coffee keeps it free for everyone." → dismiss or donate.
- **No paywalls, no ads, no tracking.** Voluntary only.
- Footer on every page: "Free & open source. Made with ❤️ — consider supporting."
- Goal: 0.5–2% conversion of returning users.

---

## 8. SEO & Growth

- Per-tool routes with unique `<title>`/meta (e.g., "SQL Formatter — Free Online SQL Formatter & Beautifier").
- `sitemap.xml` + `robots.txt`.
- Each tool page: H1, short intro paragraph with target keywords, the tool, FAQ accordion (rich-snippet eligible).
- Open Graph image per tool (static, generated at build).
- Submit to: Hacker News "Show HN", r/SQL, r/database, r/PostgreSQL, dev.to, free alternatives to dbdiagram.io SEO terms.
- Schema.org `WebApplication` JSON-LD.

---

## 9. Build Phases & Milestones

| Phase | Scope | Deliverable |
|---|---|---|
| **0. Scaffold** | Vite+React+TS, Tailwind, shadcn/ui, Monaco, Zustand, Router, layout shell | Empty app with editor + tab shell, deploys to Vercel |
| **1. Formatter + Validator** | sql-formatter integration, options UI, parse-error overlay, copy/download | First usable tool live |
| **2. Execution Flow** | AST→ordered-clauses, React Flow pipeline, play animation, subquery nesting | Killer differentiator live |
| **3. ERD** | DDL parser, table nodes, FK edges, naming heuristics, dbdiagram-style canvas, PNG/DBML export | dbdiagram competitor live |
| **4. Plan Explainer** | Postgres JSON parser, tree viz, heat coloring, bottleneck detection | EXPLAIN debugger live |
| **5. Optimizer** | Rules engine (12 rules), findings UI, rewrite suggestions, apply button | Heuristic advisor live |
| **6. AI Explain** | Settings modal, provider client, streaming chat panel, prompt templates | Power-user feature live |
| **7. Polish & Ship** | SEO routes+meta+FAQ, donation widgets, sample queries, landing hero, Lighthouse pass, sitemap, "Show HN" | Public launch |

---

## 10. Key Technical Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `node-sql-parser` fails on niche dialect syntax | Wrap parse in try/catch, fall back to "validation only" mode, surface raw error |
| React Flow performance with large schemas (>100 tables) | Virtualize nodes, cap default render, add "layout density" toggle |
| Monaco bundle size (~2MB) | Lazy-load editor only on workbench routes, use Vite dynamic import |
| EXPLAIN text-format parsing inconsistency | Ship Postgres JSON first (stable), text format as best-effort |
| Naming-heuristic false positives in ERD | Mark inferred relationships as "guessed" (dashed edge), let user confirm/delete |
| LLM key leakage | localStorage only, never logged, never sent to our origin, clear warning |

---

## 11. Non-Goals (for MVP)

- Running queries against real databases (security + infra cost).
- User accounts / cloud sync (Phase 2 if traction).
- Multi-tab workspaces / projects (Phase 2).
- Collaborative editing.
- Mobile-native app.
- Paid tiers.

---

## 12. Definition of Done (MVP)

All 5 MVP features working client-side, deployed to a public URL, donation widget live, Lighthouse ≥ 90 on all metrics, sample queries loadable in one click, README + LICENSE (MIT) in repo.

---

## 13. Open Decisions (to confirm before/during build)

- [ ] Default dialect priority (recommend: PostgreSQL-first, MySQL second)
- [ ] BMC vs Ko-fi handle / username
- [ ] Repo name & license (recommend: MIT)
- [ ] Domain name (optional for MVP — can use `*.vercel.app`)
- [ ] GA/plausible for traffic analytics (recommend: Plausible self-hosted or Cloudflare Web Analytics — free, privacy-friendly)
