import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useUiStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { PROVIDERS, type LlmProvider } from '@/lib/llm/client'
import { ExternalLink, Eye, EyeOff, KeyRound, AlertTriangle } from 'lucide-react'

export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const { llmProvider, llmModel, llmApiKey, setLlmProvider, setLlmModel, setLlmApiKey } = useSettingsStore()

  const [provider, setProvider] = useState<LlmProvider>(llmProvider)
  const [model, setModel] = useState(llmModel)
  const [key, setKey] = useState(llmApiKey)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    if (open) {
      setProvider(llmProvider)
      setModel(llmModel)
      setKey(llmApiKey)
      setShowKey(false)
    }
  }, [open, llmProvider, llmModel, llmApiKey])

  const cfg = PROVIDERS[provider]

  const handleProviderChange = (p: LlmProvider) => {
    setProvider(p)
    setModel(PROVIDERS[p].models[0])
  }

  const save = () => {
    setLlmProvider(provider)
    setLlmModel(model.trim())
    setLlmApiKey(key.trim())
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI provider settings</DialogTitle>
          <DialogDescription>
            Configure an OpenAI-compatible provider. Your key is stored only in this browser (localStorage) and sent directly to the provider — never to our servers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Provider</label>
            <Select value={provider} onChange={(e) => handleProviderChange(e.target.value as LlmProvider)}>
              {(Object.keys(PROVIDERS) as LlmProvider[]).map((p) => (
                <option key={p} value={p}>{PROVIDERS[p].label}</option>
              ))}
            </Select>
            <p className="text-[11px] text-muted-foreground">{cfg.hint}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Model</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              list="model-suggestions"
              placeholder="model name"
              className="flex h-9 w-full rounded-md border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <datalist id="model-suggestions">
              {cfg.models.map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">API key</label>
            <div className="relative">
              <KeyRound className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={`${cfg.label} API key`}
                autoComplete="off"
                spellCheck={false}
                className="flex h-9 w-full rounded-md border border-border bg-secondary pl-8 pr-9 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title={showKey ? 'Hide' : 'Show'}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <a href={cfg.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
              Get a {cfg.label} API key <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] text-red-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Your API key is stored only in your browser. We are not responsible for any usage charges incurred by your key.</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
