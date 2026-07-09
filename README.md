# SQL Explainer

> A free, client-side, developer-grade SQL workbench that turns raw SQL into understanding. Paste SQL → get formatted code, a visual execution-order flow, an interactive ERD, an EXPLAIN-plan breakdown, and heuristic optimization tips. Monetized via voluntary donations. Zero backend, zero operating cost.

**North-star metric:** time-to-insight — from paste to "ah, now I understand this query" in under 5 seconds.

---

## Features

- **SQL Formatter** — dialect-aware formatting (PostgreSQL, MySQL, T-SQL, BigQuery, Snowflake, …) with configurable indentation, keyword case, and style. Live preview, copy, download, apply.
- **Execution Order Visualizer** — reorders clauses into the logical order the database evaluates them (FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT) and animates each step with the exact SQL snippet and a plain-English description.
- **ERD / Schema Diagram** — generates an interactive entity-relationship diagram from `CREATE TABLE`/`ALTER TABLE` DDL or a `SELECT` query. Detects explicit foreign keys and infers relationships from naming conventions (`user_id` → `users.id`). Export to **DBML**, **PNG**, or **SVG**.
- **Query Plan Explainer** — paste PostgreSQL `EXPLAIN (ANALYZE, FORMAT JSON)` or text output and get a color-heated plan tree (by exclusive/self time), bottleneck detection (seq scans, sort spills, stale stats, nested loops), and a plain-English narrative.
- **Performance Optimizer** — 12+ heuristic rules flag `SELECT *`, non-sargable predicates, leading-wildcard `LIKE`, implicit type casts, `OR` across columns, cartesian joins, `NOT IN (subquery)`, redundant `DISTINCT`, and more — with click-to-highlight and one-click rewrites.
- **AI Deep Explain** *(optional)* — LLM-powered query walkthroughs using your own API key (Groq / OpenAI / OpenRouter). Your key never leaves the browser. Defaults to free-tier Groq.

Everything runs **100% client-side**. No signup, no ads, no tracking. Your SQL never touches a server (except the optional AI call, which goes directly to your chosen provider).

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Vite 6 + React 18 + TypeScript |
| Styling | Tailwind CSS 3 + shadcn/ui-style Radix primitives |
| Editor | Monaco Editor (`@monaco-editor/react`) |
| SQL parsing | `node-sql-parser` (multi-dialect AST) |
| Formatting | `sql-formatter` (dialect-aware) |
| Graph viz | `@xyflow/react` (React Flow v12) + `dagre` layout |
| State | Zustand (with `persist`) |
| Routing | React Router v6 (lazy-loaded routes) |
| LLM | `openai` SDK (OpenAI-compatible: Groq / OpenAI / OpenRouter) |
| Export | `html-to-image` (ERD PNG/SVG) |

---

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

### Scripts

```bash
npm run dev        # vite dev server
npm run build      # tsc -b && vite build  → dist/
npm run preview    # preview the production build
npm run typecheck  # tsc -b --noEmit
npm run lint       # eslint .
```

Node 18+ recommended.

---

## Project structure

```
src/
├── components/
│   ├── editor/            # Monaco SQL editor
│   ├── layout/            # Header, Footer, AppLayout, Workbench, Faq
│   └── ui/                # button, tabs, select, dialog, toast (Radix)
├── features/
│   ├── formatter/         # Format options panel
│   ├── execution-flow/    # ExecutionFlow + FlowNode
│   ├── erd/               # ErdCanvas, TableNode, layout, export
│   ├── query-plan/        # PlanTree + PlanNodeView
│   ├── optimizer/         # OptimizerPanel
│   ├── ai-explain/        # AiPanel + SettingsModal
│   └── donation/          # DonationNudge toast
├── lib/
│   ├── sql/               # parser, formatter, clauseSplitter, executionOrder, erdExtractor
│   ├── queryPlan/         # parsePlan (JSON + text + heat + findings)
│   ├── heuristics/        # 12-rule optimizer engine
│   ├── llm/               # OpenAI-compatible client + prompts
│   ├── monaco/            # SQL theme
│   ├── utils/             # cn(), download(), copyToClipboard()
│   ├── seo.ts             # useSeo hook
│   └── faqData.ts
├── pages/                 # Home, Format, ExecutionFlow, Erd, ExplainPlan, Optimize, Ai, Faq, Support
├── store/                 # sqlStore, settingsStore, editorStore, planStore, uiStore
├── types/                 # Dialect, Finding, …
├── App.tsx                # lazy-loaded routes
└── main.tsx
```

---

## Privacy

- The core tools (format, execution flow, ERD, plan, optimizer) make **zero network requests**. They run entirely in your browser.
- The optional **AI panel** sends your SQL directly to the LLM provider you configure, using your own API key. The key is stored in `localStorage` and is never sent to any origin other than the provider's API.
- No analytics, no cookies, no third-party trackers. (A privacy-friendly analytics option may be added later — see `PLAN.md` §13.)

---

## Roadmap

See `PLAN.md` for the full build plan. Phases 0–7 (scaffold through polish) are complete. Potential future work: multi-tab workspaces, cloud sync, mobile-native, additional plan formats (MySQL/T-SQL text).

---

## License

[MIT](./LICENSE) — free and open source. If it saves you time, consider [supporting the project](./SUPPORT) ☕
