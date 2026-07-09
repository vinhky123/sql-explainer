import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { SettingsModal } from '@/features/ai-explain/SettingsModal'
import { DonationNudge } from '@/features/donation/DonationNudge'

export function AppLayout() {
  return (
    <div className="flex h-full flex-col">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Header />
      <main id="main-content" className="flex-1 overflow-hidden" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <SettingsModal />
      <DonationNudge />
    </div>
  )
}
