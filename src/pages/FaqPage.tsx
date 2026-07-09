import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Faq } from '@/components/layout/Faq'
import { faqs, faqJsonLd } from '@/lib/faqData'
import { useSeo } from '@/lib/seo'

export function FaqPage() {
  useSeo({
    title: 'FAQ — SQL Explainer Help & Common Questions',
    description: 'Answers to common questions about SQL Explainer: privacy, supported dialects, how the execution flow and ERD work, AI key safety, and more.',
    jsonLd: faqJsonLd,
  })
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
        </Button>
        <h1 className="text-3xl font-bold">Frequently asked questions</h1>
        <p className="mt-2 text-muted-foreground">Everything about how SQL Explainer works, your privacy, and supported features.</p>
        <div className="mt-8">
          <Faq items={faqs} />
        </div>
      </div>
    </div>
  )
}
