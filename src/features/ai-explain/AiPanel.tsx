import { useState, useRef, useCallback, useEffect } from 'react'
import { useSqlStore } from '@/store/sqlStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { parseSql } from '@/lib/sql/parser'
import { runHeuristics } from '@/lib/heuristics/rules'
import { streamChat, friendlyError, type ChatMessage } from '@/lib/llm/client'
import { SYSTEM_PROMPT, buildExplainUserMessage } from '@/lib/llm/prompts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Sparkles, Send, Square, Settings2, AlertCircle, Bot, User, Trash2, Wand2,
} from 'lucide-react'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

export function AiPanel() {
  const { sql, dialect } = useSqlStore()
  const { llmProvider, llmModel, llmApiKey } = useSettingsStore()
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)

  const [messages, setMessages] = useState<Msg[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partial, setPartial] = useState('')
  const [input, setInput] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, partial])

  const hasKey = !!llmApiKey.trim()

  const send = useCallback(async (userText: string) => {
    if (!userText.trim() || streaming) return
    if (!hasKey) { setSettingsOpen(true); return }

    setError(null)
    const findings = runHeuristics(sql, parseSql(sql, dialect).ast, dialect)
    const history: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role, content: m.content } as ChatMessage)),
    ]
    const isFirst = messages.length === 0
    history.push({
      role: 'user',
      content: isFirst ? buildExplainUserMessage(sql, dialect, findings) : userText.trim(),
    })

    setMessages((m) => [...m, { role: 'user', content: isFirst ? 'Explain this query' : userText.trim() }, { role: 'assistant', content: '' }])
    setStreaming(true)
    setPartial('')
    const controller = new AbortController()
    abortRef.current = controller

    try {
      let acc = ''
      await streamChat({
        provider: llmProvider,
        model: llmModel,
        apiKey: llmApiKey,
        messages: history,
        signal: controller.signal,
        onDelta: (d) => {
          acc += d
          setPartial(acc)
        },
      })
      setMessages((m) => {
        const copy = [...m]
        copy[copy.length - 1] = { role: 'assistant', content: acc }
        return copy
      })
    } catch (e) {
      if (controller.signal.aborted) {
        setMessages((m) => {
          const copy = [...m]
          const last = copy[copy.length - 1]
          if (last?.role === 'assistant') copy[copy.length - 1] = { role: 'assistant', content: (last.content || partial) + '\n\n_(stopped)_' }
          return copy
        })
      } else {
        setError(friendlyError(e))
        setMessages((m) => m.slice(0, -1))
      }
    } finally {
      setStreaming(false)
      setPartial('')
      abortRef.current = null
    }
  }, [sql, dialect, messages, streaming, hasKey, llmProvider, llmModel, llmApiKey, setSettingsOpen, partial])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clear = useCallback(() => {
    if (streaming) abortRef.current?.abort()
    setMessages([])
    setError(null)
    setPartial('')
  }, [streaming])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">AI Deep Explain</span>
        <span className="text-xs text-muted-foreground">{llmProvider} · {llmModel}</span>
        <div className="flex-1" />
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clear} title="Clear conversation">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)} title="AI settings">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {!hasKey && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>No API key configured.</span>
            <Button size="sm" variant="outline" className="ml-auto h-6 border-amber-500/40 text-amber-200" onClick={() => setSettingsOpen(true)}>
              Add key
            </Button>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-3">
        {messages.length === 0 && !streaming ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              Get an AI walkthrough of your query — what it does, how it runs, and how to improve it. Includes the heuristic optimizer's findings as context.
            </p>
            <Button
              size="sm"
              disabled={!sql.trim() || !hasKey}
              onClick={() => send('Explain this query')}
              title={!sql.trim() ? 'Paste SQL first' : !hasKey ? 'Add an API key first' : 'Explain'}
            >
              <Wand2 className="h-3.5 w-3.5" />
              Explain this query
            </Button>
            {!sql.trim() && <p className="text-[11px] text-muted-foreground">Paste a query in the editor first.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} streaming={streaming && i === messages.length - 1 && m.role === 'assistant' && partial !== '' ? partial : undefined} />
            ))}
            {streaming && partial === '' && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                Thinking…
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-pre-wrap">{error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 p-2.5">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
                setInput('')
              }
            }}
            placeholder={messages.length === 0 ? 'Ask a follow-up… (or click "Explain this query")' : 'Ask a follow-up question…'}
            rows={1}
            className="min-h-[36px] max-h-32 flex-1 resize-none rounded-md border border-border bg-secondary px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {streaming ? (
            <Button size="icon" variant="secondary" onClick={stop} title="Stop">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" disabled={!input.trim() || !hasKey} onClick={() => { send(input); setInput('') }} title="Send">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Your API key stays in your browser. AI responses may be inaccurate — verify before relying on them.
        </p>
      </div>
    </div>
  )
}

function Bubble({ role, content, streaming }: { role: 'user' | 'assistant'; content: string; streaming?: string }) {
  const isUser = role === 'user'
  const text = streaming ?? content
  const Icon = isUser ? User : Bot
  return (
    <div className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', isUser ? 'bg-secondary text-muted-foreground' : 'bg-primary/15 text-primary')}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed', isUser ? 'bg-primary/15 text-foreground' : 'bg-secondary/60 text-foreground/90')}>
        <div className="whitespace-pre-wrap break-words">{text || (streaming !== undefined ? '…' : '')}{streaming !== undefined && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-primary align-middle" />}</div>
      </div>
    </div>
  )
}
