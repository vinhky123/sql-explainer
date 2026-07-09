import { Workbench } from '@/components/layout/Workbench'
import { AiPanel } from '@/features/ai-explain/AiPanel'
import { useSeo, SrOnlyH1 } from '@/lib/seo'

export function AiPage() {
  useSeo({
    title: 'AI SQL Explainer — LLM-Powered Query Walkthrough | SQL Explainer',
    description: 'Get an AI walkthrough of any SQL query — what it does, how it runs, and how to improve it. Uses your own API key (Groq/OpenAI/OpenRouter). Your key never leaves your browser.',
  })
  return (
    <>
      <SrOnlyH1>AI SQL Explainer</SrOnlyH1>
      <Workbench rightPanel={<AiPanel />} />
    </>
  )
}
