import { Workbench } from '@/components/layout/Workbench'
import { OptimizerPanel } from '@/features/optimizer/OptimizerPanel'
import { useSqlStore } from '@/store/sqlStore'
import { Button } from '@/components/ui/button'
import { FileCode2 } from 'lucide-react'
import { useSeo, SrOnlyH1 } from '@/lib/seo'

const SAMPLE = `SELECT DISTINCT *, COUNT(*) AS cnt
FROM orders o
CROSS JOIN customers c
WHERE o.name LIKE '%son'
  AND DATE(o.created_at) = '2024-01-01'
  AND o.id = '5'
  AND o.id NOT IN (SELECT id FROM blocked)
  OR o.status = 'paid'
  AND o.customer_id IN (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22)
GROUP BY o.name
HAVING COUNT(*) > 0
ORDER BY o.name
LIMIT 10;`

export function OptimizePage() {
  useSeo({
    title: 'SQL Optimizer — Heuristic Query Performance Checker | SQL Explainer',
    description: 'Free SQL optimizer: 12+ heuristic rules flag SELECT *, non-sargable predicates, leading-wildcard LIKEs, implicit casts, cartesian joins, stale stats, and more — with suggested rewrites. Client-side.',
  })
  const loadSample = useSqlStore((s) => s.loadSample)
  return (
    <>
      <SrOnlyH1>SQL Performance Optimizer</SrOnlyH1>
      <Workbench
        toolbar={
          <Button size="sm" variant="outline" onClick={() => loadSample(SAMPLE)} title="Load a query that breaks several rules">
            <FileCode2 className="h-3.5 w-3.5" />
            Sample
          </Button>
        }
        rightPanel={<OptimizerPanel />}
      />
    </>
  )
}
