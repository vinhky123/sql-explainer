import { Link } from 'react-router-dom'
import { Coffee } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-border/60 px-4 py-3 text-center text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          Free &amp; open source. Made with
          <span className="text-rose-400">♥</span>
        </span>
        <Link to="/faq" aria-label="Frequently asked questions" className="hover:text-foreground hover:underline">FAQ</Link>
        <Link to="/support" aria-label="Support the project" className="inline-flex items-center gap-1 text-amber-400 hover:underline">
          <Coffee className="h-3 w-3" /> Support
        </Link>
        <a href="https://github.com" target="_blank" rel="noreferrer" aria-label="Source code on GitHub" className="hover:text-foreground hover:underline">GitHub</a>
      </div>
    </footer>
  )
}
