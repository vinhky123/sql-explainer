import { useMemo } from 'react'
import { PlanTree } from '@/features/query-plan/PlanTree'
import { parsePlan } from '@/lib/queryPlan/parsePlan'
import { usePlanStore } from '@/store/planStore'
import { Button } from '@/components/ui/button'
import { ClipboardPaste, Eraser, FileJson } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSeo, SrOnlyH1 } from '@/lib/seo'

const SAMPLE_JSON = `[
  {
    "Plan": {
      "Node Type": "Limit",
      "Startup Cost": 100000.45,
      "Total Cost": 100000.48,
      "Plan Rows": 10,
      "Plan Width": 56,
      "Actual Startup Time": 423.012,
      "Actual Total Time": 423.015,
      "Actual Rows": 10,
      "Actual Loops": 1,
      "Plans": [
        {
          "Node Type": "Sort",
          "Startup Cost": 100000.45,
          "Total Cost": 103000.45,
          "Plan Rows": 1200000,
          "Plan Width": 56,
          "Actual Startup Time": 420.0,
          "Actual Total Time": 422.9,
          "Actual Rows": 1200000,
          "Actual Loops": 1,
          "Sort Key": ["o.total DESC"],
          "Sort Method": "external merge  Disk: 24000kB",
          "Plans": [
            {
              "Node Type": "Hash Join",
              "Startup Cost": 100.00,
              "Total Cost": 50000.00,
              "Plan Rows": 100000,
              "Plan Width": 56,
              "Actual Startup Time": 0.5,
              "Actual Total Time": 300.0,
              "Actual Rows": 1200000,
              "Actual Loops": 1,
              "Hash Cond": "(o.customer_id = c.id)",
              "Plans": [
                {
                  "Node Type": "Seq Scan",
                  "Relation Name": "orders",
                  "Alias": "o",
                  "Startup Cost": 0.00,
                  "Total Cost": 30000.00,
                  "Plan Rows": 1200000,
                  "Plan Width": 24,
                  "Actual Startup Time": 0.012,
                  "Actual Total Time": 150.0,
                  "Actual Rows": 1200000,
                  "Actual Loops": 1,
                  "Filter": "(status = 'paid')"
                },
                {
                  "Node Type": "Hash",
                  "Startup Cost": 50.00,
                  "Total Cost": 50.00,
                  "Plan Rows": 5000,
                  "Plan Width": 32,
                  "Actual Startup Time": 0.3,
                  "Actual Total Time": 0.3,
                  "Actual Rows": 5000,
                  "Actual Loops": 1,
                  "Plans": [
                    {
                      "Node Type": "Seq Scan",
                      "Relation Name": "customers",
                      "Alias": "c",
                      "Startup Cost": 0.00,
                      "Total Cost": 50.00,
                      "Plan Rows": 5000,
                      "Plan Width": 32,
                      "Actual Startup Time": 0.01,
                      "Actual Total Time": 0.2,
                      "Actual Rows": 5000,
                      "Actual Loops": 1
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    "Execution Time": 423.456,
    "Planning Time": 0.123
  }
]`

export function ExplainPlanPage() {
  useSeo({
    title: 'EXPLAIN Plan Visualizer — Query Plan Explainer | SQL Explainer',
    description: 'Paste PostgreSQL EXPLAIN (ANALYZE, FORMAT JSON) or text output and get a color-heated plan tree with bottleneck detection (seq scans, sort spills, stale stats) and a plain-English summary. Free.',
  })
  const { planText, setPlanText, loadSample, clear } = usePlanStore()
  const preview = useMemo(() => parsePlan(planText), [planText])

  const formatBadge = preview.format === 'json'
    ? 'JSON'
    : preview.format === 'text'
      ? 'TEXT'
      : '—'

  return (
    <div className="flex h-full flex-col">
      <SrOnlyH1>Query Plan Explainer</SrOnlyH1>
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <ClipboardPaste className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Query Plan Explainer</span>
        <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{formatBadge}</span>
        <span className="text-xs text-muted-foreground">Paste EXPLAIN output → get a visual, color-heated plan tree with bottleneck detection.</span>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => loadSample(SAMPLE_JSON)}>
          <FileJson className="h-3.5 w-3.5" />
          Sample
        </Button>
        <Button size="sm" variant="ghost" onClick={clear} title="Clear">
          <Eraser className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
        <div className="flex min-h-0 flex-col border-r border-border/60">
          <div className="border-b border-border/40 px-3 py-1 text-[11px] text-muted-foreground">
            EXPLAIN output — supports PostgreSQL <code className="font-mono text-foreground/80">FORMAT JSON</code> &amp; indented text
          </div>
          <textarea
            value={planText}
            onChange={(e) => setPlanText(e.target.value)}
            spellCheck={false}
            placeholder={`-- Paste EXPLAIN (ANALYZE, FORMAT JSON) output here\n[\n  { "Plan": { "Node Type": "Seq Scan", ... } }\n]\n\n-- or an indented text plan:\nSeq Scan on orders  (cost=0.00..423.00 rows=1200000 width=8) (actual time=0.012..423.123 rows=1200000 loops=1)`}
            className={cn(
              'min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-[12px] leading-relaxed',
              'text-foreground/90 placeholder:text-muted-foreground/60',
              'outline-none focus:bg-background/40',
            )}
          />
        </div>
        <div className="min-h-0 overflow-hidden">
          <PlanTree />
        </div>
      </div>
    </div>
  )
}
