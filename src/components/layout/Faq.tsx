import { cn } from '@/lib/utils'

export interface FaqItem {
  q: string
  a: string
}

export function Faq({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {items.map((item, i) => (
        <details key={i} className="group rounded-lg border border-border/60 bg-card/40 px-4 py-3 open:bg-card/70">
          <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-medium text-foreground marker:content-none">
            {item.q}
            <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
        </details>
      ))}
    </div>
  )
}
