import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'

const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })))
const FormatPage = lazy(() => import('@/pages/FormatPage').then((m) => ({ default: m.FormatPage })))
const ExecutionFlowPage = lazy(() => import('@/pages/ExecutionFlowPage').then((m) => ({ default: m.ExecutionFlowPage })))
const ErdPage = lazy(() => import('@/pages/ErdPage').then((m) => ({ default: m.ErdPage })))
const ExplainPlanPage = lazy(() => import('@/pages/ExplainPlanPage').then((m) => ({ default: m.ExplainPlanPage })))
const OptimizePage = lazy(() => import('@/pages/OptimizePage').then((m) => ({ default: m.OptimizePage })))
const AiPage = lazy(() => import('@/pages/AiPage').then((m) => ({ default: m.AiPage })))
const FaqPage = lazy(() => import('@/pages/FaqPage').then((m) => ({ default: m.FaqPage })))
const SupportPage = lazy(() => import('@/pages/SupportPage').then((m) => ({ default: m.SupportPage })))

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Suspense fallback={<PageFallback />}><HomePage /></Suspense>} />
          <Route path="/format" element={<Suspense fallback={<PageFallback />}><FormatPage /></Suspense>} />
          <Route path="/execution-flow" element={<Suspense fallback={<PageFallback />}><ExecutionFlowPage /></Suspense>} />
          <Route path="/erd" element={<Suspense fallback={<PageFallback />}><ErdPage /></Suspense>} />
          <Route path="/explain-plan" element={<Suspense fallback={<PageFallback />}><ExplainPlanPage /></Suspense>} />
          <Route path="/optimize" element={<Suspense fallback={<PageFallback />}><OptimizePage /></Suspense>} />
          <Route path="/ai" element={<Suspense fallback={<PageFallback />}><AiPage /></Suspense>} />
          <Route path="/faq" element={<Suspense fallback={<PageFallback />}><FaqPage /></Suspense>} />
          <Route path="/support" element={<Suspense fallback={<PageFallback />}><SupportPage /></Suspense>} />
          <Route path="*" element={<Suspense fallback={<PageFallback />}><HomePage /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
