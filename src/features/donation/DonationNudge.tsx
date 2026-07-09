import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ToastProvider, ToastViewport, Toast, ToastClose } from '@/components/ui/toast'
import { Coffee, X } from 'lucide-react'

const SESSIONS_KEY = 'sql-explainer-sessions'
const NUDGE_THRESHOLD = 5
const DISMISSED_KEY = 'sql-explainer-nudge-dismissed'

function bumpSessionCount(): number {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    const n = raw ? parseInt(raw, 10) || 0 : 0
    const next = n + 1
    localStorage.setItem(SESSIONS_KEY, String(next))
    return next
  } catch {
    return 0
  }
}

export function DonationNudge() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return
    } catch {
      return
    }
    const count = bumpSessionCount()
    if (count >= NUDGE_THRESHOLD) {
      const t = setTimeout(() => setOpen(true), 2500)
      return () => clearTimeout(t)
    }
  }, [])

  const dismiss = (dontShowAgain: boolean) => {
    setOpen(false)
    if (dontShowAgain) {
      try { localStorage.setItem(DISMISSED_KEY, '1') } catch { /* ignore quota / privacy mode */ }
    }
  }

  return (
    <ToastProvider duration={12000}>
      <Toast open={open} onOpenChange={(o) => { if (!o) dismiss(false) }}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
          <Coffee className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Finding this useful?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A coffee keeps SQL Explainer free for everyone.{' '}
            <Link to="/support" className="font-medium text-primary hover:underline" onClick={() => dismiss(false)}>
              Support →
            </Link>
          </p>
          <button
            onClick={() => dismiss(true)}
            className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Don't show again
          </button>
        </div>
        <ToastClose asChild>
          <button className="absolute right-2 top-2" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </ToastClose>
      </Toast>
      <ToastViewport />
    </ToastProvider>
  )
}
