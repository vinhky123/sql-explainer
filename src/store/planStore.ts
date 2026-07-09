import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PlanState {
  planText: string
  setPlanText: (text: string) => void
  loadSample: (text: string) => void
  clear: () => void
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set) => ({
      planText: '',
      setPlanText: (planText) => set({ planText }),
      loadSample: (planText) => set({ planText }),
      clear: () => set({ planText: '' }),
    }),
    { name: 'sql-explainer-plan' },
  ),
)
