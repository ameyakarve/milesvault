'use client'

import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { useRef, useState, useEffect } from 'react'
import { Sparkle, ArrowUp, Trash, Paperclip, X } from '@phosphor-icons/react'
import { isGenUiTool, renderGenUi } from './gen-ui'
import { ChatActionsContext } from './chat-actions'

type UploadedFile = {
  r2_key: string
  filename: string
  content_type: string
  size: number
}

export function ChatShell() {
  const agent = useAgent({ agent: 'LedgerDO', basePath: 'api/agents' })
  const { messages, sendMessage, status, error, clearHistory } = useAgentChat({
    agent,
  })
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, status])

  const busy = status === 'submitted' || status === 'streaming'

  function submit() {
    const text = input.trim()
    if (busy || uploading) return
    if (!text && attachments.length === 0) return
    const attachmentBlock = attachments
      .map(
        (a) =>
          `[Attached: ${a.filename} (r2_key=\`${a.r2_key}\`, type=${a.content_type}, size=${a.size})]`,
      )
      .join('\n')
    const body = attachmentBlock
      ? text
        ? `${attachmentBlock}\n\n${text}`
        : `${attachmentBlock}\n\nPlease ingest this.`
      : text
    setInput('')
    setAttachments([])
    void sendMessage({ text: body })
  }

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return
    setUploadError(null)
    setUploading(true)
    try {
      const next: UploadedFile[] = []
      for (const f of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', f)
        const res = await fetch('/api/ingest/upload', {
          method: 'POST',
          body: fd,
        })
        if (!res.ok) {
          const msg = await res.text().catch(() => res.statusText)
          throw new Error(msg || `upload failed (${res.status})`)
        }
        const body = (await res.json()) as UploadedFile
        next.push(body)
      }
      setAttachments((prev) => [...prev, ...next])
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const empty = messages.length === 0

  return (
    <ChatActionsContext.Provider value={{ sendMessage, busy }}>
      <section className="relative flex flex-1 flex-col overflow-hidden">
        {!empty && (
          <button
            type="button"
            onClick={clearHistory}
            disabled={busy}
            className="absolute right-6 top-4 z-10 inline-flex items-center gap-1.5 rounded-[8px] border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-40"
            aria-label="Clear chat"
          >
            <Trash size={14} weight="regular" />
            Clear
          </button>
        )}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8">
          {empty ? (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md text-center">
                <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-[8px] bg-teal-500 text-white">
                  <Sparkle size={20} weight="regular" />
                </div>
                <h2 className="mb-2 text-lg font-semibold text-slate-900">
                  Ask the agent anything
                </h2>
                <p className="text-sm text-slate-500">
                  Try “what did I spend on groceries last month?” or “show top
                  payees this year.”
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.map((m) => (
                <MessageRow key={m.id} role={m.role} parts={m.parts} />
              ))}
              {status === 'submitted' && (
                <div className="text-xs text-slate-400">Thinking…</div>
              )}
              {error && (
                <div className="rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error.message}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-slate-200 px-6 py-6">
        <div className="mx-auto w-full max-w-3xl">
          {(attachments.length > 0 || uploadError || uploading) && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {attachments.map((a) => (
                <span
                  key={a.r2_key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700"
                >
                  <Paperclip size={12} weight="regular" />
                  <span className="max-w-[200px] truncate">{a.filename}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((prev) =>
                        prev.filter((x) => x.r2_key !== a.r2_key),
                      )
                    }
                    className="text-slate-400 hover:text-slate-700"
                    aria-label="Remove attachment"
                  >
                    <X size={12} weight="bold" />
                  </button>
                </span>
              ))}
              {uploading && (
                <span className="text-[11px] text-slate-500">Uploading…</span>
              )}
              {uploadError && (
                <span className="text-[11px] text-rose-600">{uploadError}</span>
              )}
            </div>
          )}
          <div className="flex items-end gap-3 rounded-[12px] border border-slate-200 bg-white px-4 py-3 focus-within:border-teal-500">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || uploading}
              className="shrink-0 rounded-[8px] border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-40"
              aria-label="Attach file"
            >
              <Paperclip size={18} weight="regular" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.csv,.ofx,.qif,.png,.jpg,.jpeg,.webp,.txt,application/pdf,text/csv,image/*"
              className="hidden"
              onChange={onPickFile}
            />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={4}
              placeholder="Message the agent…"
              className="flex-1 resize-none bg-transparent text-sm leading-6 text-slate-900 placeholder:text-slate-400 outline-none"
            />
            <button
              type="button"
              onClick={submit}
              disabled={
                busy ||
                uploading ||
                (!input.trim() && attachments.length === 0)
              }
              className="shrink-0 rounded-[8px] bg-teal-500 p-2 text-white transition disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp size={18} weight="bold" />
            </button>
          </div>
        </div>
      </footer>
    </ChatActionsContext.Provider>
  )
}

type Part =
  | { type: 'text'; text: string }
  | { type: string; [k: string]: unknown }

function MessageRow({ role, parts }: { role: string; parts: unknown }) {
  const list = Array.isArray(parts) ? (parts as Part[]) : []
  const isUser = role === 'user'
  const hasGenUi = list.some(
    (p) =>
      p.type.startsWith('tool-') &&
      isGenUiTool(p.type) &&
      (p as { state?: string }).state === 'output-available',
  )
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white">
          <Sparkle size={14} weight="regular" />
        </div>
      )}
      <div
        className={`${hasGenUi ? 'w-full max-w-2xl' : 'max-w-[80%]'} rounded-[12px] px-4 py-3 text-sm leading-6 ${
          isUser ? 'bg-teal-500 text-white' : 'bg-slate-50 text-slate-900'
        }`}
      >
        {list.map((p, i) => {
          if (p.type === 'text') {
            return (
              <div key={i} className="whitespace-pre-wrap">
                {(p as { text: string }).text}
              </div>
            )
          }
          if (p.type.startsWith('tool-')) {
            const tp = p as {
              type: string
              state?: string
              input?: unknown
              output?: unknown
            }
            if (
              isGenUiTool(tp.type) &&
              tp.state === 'output-available'
            ) {
              const payload = tp.output ?? tp.input
              const rendered = renderGenUi(tp.type, payload)
              if (rendered) {
                return (
                  <div key={i} className="my-2">
                    {rendered}
                  </div>
                )
              }
            }
            return (
              <details
                key={i}
                className="my-1 rounded-[8px] border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
              >
                <summary className="cursor-pointer select-none">
                  {tp.type}
                  {tp.state ? ` · ${tp.state}` : ''}
                </summary>
                {tp.input ? (
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px]">
                    {JSON.stringify(tp.input, null, 2)}
                  </pre>
                ) : null}
                {tp.output ? (
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px]">
                    {JSON.stringify(tp.output, null, 2)}
                  </pre>
                ) : null}
              </details>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}
