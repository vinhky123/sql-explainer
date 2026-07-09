import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  theme: 'dark' | 'light'
  toggleTheme: () => void
  llmProvider: 'openai' | 'groq' | 'openrouter'
  llmModel: string
  llmApiKey: string
  setLlmProvider: (p: 'openai' | 'groq' | 'openrouter') => void
  setLlmModel: (m: string) => void
  setLlmApiKey: (k: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      llmProvider: 'groq',
      llmModel: 'llama-3.3-70b-versatile',
      llmApiKey: '',
      setLlmProvider: (llmProvider) => set({ llmProvider }),
      setLlmModel: (llmModel) => set({ llmModel }),
      setLlmApiKey: (llmApiKey) => set({ llmApiKey }),
    }),
    { name: 'sql-explainer-settings' },
  ),
)
