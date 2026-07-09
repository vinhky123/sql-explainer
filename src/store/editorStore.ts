import { create } from 'zustand'

interface EditorState {
  editor: any
  setEditor: (e: any) => void
  highlight: (startOffset: number, endOffset: number) => void
  clearHighlight: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  editor: null,
  setEditor: (editor) => set({ editor }),
  highlight: (startOffset, endOffset) => {
    const editor = get().editor
    if (!editor) return
    const model = editor.getModel()
    if (!model) return
    const start = model.getPositionAt(startOffset)
    const end = model.getPositionAt(endOffset)
    const Range = (window as any).monaco.Range
    editor.setSelection(Range.fromPositions(start, end))
    editor.revealLineInCenter(start.lineNumber)
    editor.focus()
  },
  clearHighlight: () => {
    const editor = get().editor
    if (!editor) return
    const model = editor.getModel()
    if (!model) return
    const Range = (window as any).monaco.Range
    editor.setSelection(Range.fromPositions({ lineNumber: 1, column: 1 }, { lineNumber: 1, column: 1 }))
  },
}))
