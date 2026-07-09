import { Link } from 'react-router-dom'
import { ArrowLeft, Coffee, BookOpen, Lightbulb, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSeo, SrOnlyH1 } from '@/lib/seo'

const BMC_URL = 'https://www.buymeacoffee.com'
const KOFI_URL = 'https://ko-fi.com'

const tiers = [
  {
    icon: Coffee,
    title: 'Buy me a coffee',
    amount: '$3',
    desc: 'A one-time thank-you. Keeps the late-night coding fueled.',
    url: BMC_URL,
    accent: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  },
  {
    icon: BookOpen,
    title: 'Sponsor a database book',
    amount: '$15',
    desc: 'Helps me keep learning the dark arts of query planners.',
    url: KOFI_URL,
    accent: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  },
  {
    icon: Lightbulb,
    title: 'Keep the lights on',
    amount: '$25+',
    desc: 'Covers the domain, hosting, and lets me build more free tools.',
    url: KOFI_URL,
    accent: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  },
]

export function SupportPage() {
  useSeo({
    title: 'Support SQL Explainer — Donate & Keep It Free',
    description: 'SQL Explainer is free and open source. If it saved you time, consider buying me a coffee or sponsoring a database book. 100% voluntary — no paywalls, ever.',
  })
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
        </Button>
        <SrOnlyH1>Support SQL Explainer</SrOnlyH1>
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
          <Heart className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-3xl font-bold">Keep it free for everyone</h2>
        <p className="mt-2 max-w-xl text-muted-foreground">
          SQL Explainer is free, open source, and ad-free. If it saved you an hour debugging a slow query, a voluntary tip keeps it running and free for the next developer. No paywalls, no tracking — just goodwill.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {tiers.map((t) => (
            <a
              key={t.title}
              href={t.url}
              target="_blank"
              rel="noreferrer"
              className={`flex flex-col rounded-xl border p-5 transition-all hover:scale-[1.02] ${t.accent}`}
            >
              <t.icon className="h-6 w-6" />
              <span className="mt-3 text-2xl font-bold">{t.amount}</span>
              <span className="font-semibold">{t.title}</span>
              <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
            </a>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Prefer GitHub? <a href="https://github.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">Star the repo</a> — it genuinely helps.
        </p>
      </div>
    </div>
  )
}
