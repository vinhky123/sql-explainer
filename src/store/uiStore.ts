import { create } from 'zustand'

interface UiState {
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}))
