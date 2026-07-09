import { Workbench } from '@/components/layout/Workbench'
import { ExecutionFlow } from '@/features/execution-flow/ExecutionFlow'
import { useSeo, SrOnlyH1 } from '@/lib/seo'

export function ExecutionFlowPage() {
  useSeo({
    title: 'SQL Execution Order Visualizer — See How SQL Runs | SQL Explainer',
    description: 'Visualize the logical execution order of a SQL query — FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY, LIMIT — as an animated, step-by-step pipeline. Free and client-side.',
  })
  return (
    <>
      <SrOnlyH1>SQL Execution Order Visualizer</SrOnlyH1>
      <Workbench rightPanel={<ExecutionFlow />} />
    </>
  )
}
