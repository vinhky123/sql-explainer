import { Workbench } from '@/components/layout/Workbench'
import { Construction } from 'lucide-react'

export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <Workbench
      rightPanel={
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Construction className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            This tool ships in <span className="font-mono text-primary">{phase}</span>. The editor and validator are already live — paste SQL to check syntax.
          </p>
        </div>
      }
    />
  )
}
