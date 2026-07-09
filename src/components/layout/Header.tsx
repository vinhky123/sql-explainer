import { Link, useLocation } from 'react-router-dom'
import { Database, Github, Coffee, Settings2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/uiStore'

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/format', label: 'Format' },
  { to: '/execution-flow', label: 'Execution Flow' },
  { to: '/erd', label: 'ERD' },
  { to: '/explain-plan', label: 'Plan' },
  { to: '/optimize', label: 'Optimize' },
  { to: '/ai', label: 'AI' },
]

export function Header() {
  const location = useLocation()
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 glass">
      <div className="flex h-14 items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <Database className="h-4 w-4" />
          </div>
          <span className="hidden sm:inline">SQL Explainer</span>
        </Link>
        <nav aria-label="Main navigation" className="flex flex-1 items-center gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={location.pathname === item.to ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                location.pathname === item.to
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
              )}
            >
              {item.label === 'AI' && <Sparkles className="mr-1 inline h-3 w-3 text-primary" />}
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="AI settings">
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="GitHub">
            <a href="https://github.com" target="_blank" rel="noreferrer">
              <Github className="h-4 w-4" />
            </a>
          </Button>
          <Button size="sm" variant="default" className="bg-amber-500/90 hover:bg-amber-500 text-amber-950" asChild>
            <a href="https://www.buymeacoffee.com" target="_blank" rel="noreferrer">
              <Coffee className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Buy me a coffee</span>
            </a>
          </Button>
        </div>
      </div>
    </header>
  )
}
