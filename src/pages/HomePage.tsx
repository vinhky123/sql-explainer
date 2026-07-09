import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Workflow, Network, Gauge, Sparkles, Wand2, FileCode2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSqlStore } from '@/store/sqlStore'
import { useSeo } from '@/lib/seo'
import { Faq } from '@/components/layout/Faq'
import { faqs, faqJsonLd } from '@/lib/faqData'

const features = [
  { to: '/format', icon: Wand2, title: 'Format & Beautify', desc: 'Dialect-aware SQL formatting with configurable style, indentation, and keyword casing.' },
  { to: '/execution-flow', icon: Workflow, title: 'Execution Order Flow', desc: 'See the logical order SQL actually runs in — FROM → WHERE → GROUP BY → SELECT → ORDER BY — as an animated pipeline.' },
  { to: '/erd', icon: Network, title: 'ERD / Schema Diagram', desc: 'Paste DDL or a SELECT and get an interactive entity-relationship diagram. Export to PNG or DBML.' },
  { to: '/explain-plan', icon: FileCode2, title: 'Query Plan Explainer', desc: 'Paste EXPLAIN output and get a visual, color-heated tree with bottleneck detection and plain-English narrative.' },
  { to: '/optimize', icon: Gauge, title: 'Performance Optimizer', desc: '12+ heuristic rules flag sargability violations, SELECT *, leading-wildcard LIKEs, and more — with rewrites.' },
  { to: '/ai', icon: Sparkles, title: 'AI Deep Explain', desc: 'Optional LLM-powered explanations using your own API key. Defaults to free-tier Groq. Never stored server-side.' },
]

const samples = [
  {
    label: 'Analytics query',
    tool: '/execution-flow',
    desc: 'A sales rollup with a join, filter, group, and having.',
    sql: `SELECT c.name AS customer, SUM(o.total) AS spend
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.created_at >= '2024-01-01'
  AND o.status = 'paid'
GROUP BY c.name
HAVING SUM(o.total) > 1000
ORDER BY spend DESC
LIMIT 10;`,
  },
  {
    label: 'Schema DDL',
    tool: '/erd',
    desc: 'Four tables with foreign keys — diagram them.',
    sql: `CREATE TABLE customers (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE);
CREATE TABLE products (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, price DECIMAL(10,2));
CREATE TABLE orders (id SERIAL PRIMARY KEY, customer_id INT NOT NULL, total DECIMAL(10,2), FOREIGN KEY (customer_id) REFERENCES customers(id));
CREATE TABLE order_items (id SERIAL PRIMARY KEY, order_id INT, product_id INT, qty INT, FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (product_id) REFERENCES products(id));`,
  },
  {
    label: 'Query to optimize',
    tool: '/optimize',
    desc: 'Breaks several rules — SELECT *, leading LIKE, sort spill bait.',
    sql: `SELECT *, COUNT(*) AS cnt
FROM orders o
WHERE o.name LIKE '%son'
  AND DATE(o.created_at) = '2024-01-01'
  AND o.id = '5'
  OR o.status = 'paid'
GROUP BY o.name
ORDER BY o.name
LIMIT 10;`,
  },
  {
    label: 'dbt model (Jinja)',
    tool: '/execution-flow',
    desc: 'A dbt model with config(), ref(), var() and an {% if %} block.',
    sql: `{{ config(materialized='table') }}

{% if is_incremental() %}
  where event_date >= '{{ var("start_date", "2024-01-01") }}'
{% endif %}

with source as (
    select * from {{ ref('stg_events') }}
),
enriched as (
    select
        user_id,
        event_type,
        {{ safe_divide('revenue', 'sessions') }} as revenue_per_session
    from source
)
select user_id, sum(revenue_per_session) as lifetime_revenue
from enriched
group by user_id
having sum(revenue_per_session) > {{ var('revenue_threshold', 100) }}
order by lifetime_revenue desc`,
  },
]

export function HomePage() {
  const loadSample = useSqlStore((s) => s.loadSample)
  const navigate = useNavigate()
  useSeo({
    title: 'SQL Explainer — Free Online SQL Formatter, ERD & Plan Visualizer',
    description: 'Free client-side SQL workbench: format SQL, visualize execution order, generate ERD diagrams, explain EXPLAIN plans, and optimize queries. No signup, no tracking.',
    jsonLd: faqJsonLd,
  })

  const loadAndGo = (sql: string, tool: string) => {
    loadSample(sql)
    navigate(tool)
  }

  return (
    <div className="h-full overflow-auto">
      <section className="relative px-6 pt-16 pb-12 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            100% client-side · no signup · free forever
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Understand any SQL query,
            <span className="bg-gradient-to-r from-primary via-fuchsia-400 to-emerald-400 bg-clip-text text-transparent"> visually</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
            Paste SQL and instantly get formatted code, an execution-order flow, an ERD, a query-plan breakdown, and optimization tips — all in your browser.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => loadAndGo(samples[0].sql, '/execution-flow')}>
              Try a sample query <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/format">Open the workbench</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="px-6 pb-10">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">Try a sample</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {samples.map((s) => (
              <button
                key={s.label}
                onClick={() => loadAndGo(s.sql, s.tool)}
                aria-label={`${s.label}: ${s.desc}`}
                className="group rounded-xl border border-border/60 bg-card/40 p-4 text-left transition-all hover:border-primary/40 hover:bg-card/80"
              >
                <div className="flex items-center gap-2">
                  <Play className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm font-semibold">{s.label}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-16">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Link
              key={f.title}
              to={f.to}
              aria-label={`${f.title}: ${f.desc}`}
              className="group rounded-xl border border-border/60 bg-card/40 p-5 transition-all hover:border-primary/40 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Open <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 text-center text-2xl font-bold">Frequently asked questions</h2>
          <Faq items={faqs} />
        </div>
      </section>
    </div>
  )
}
