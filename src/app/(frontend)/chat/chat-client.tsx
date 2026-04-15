'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState } from 'react'

import { TxnEditCard } from './txn-edit-card'

export function ChatClient({ userEmail }: { userEmail: string }) {
  const [input, setInput] = useState('')
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      credentials: 'include',
    }),
  })

  const isBusy = status === 'submitted' || status === 'streaming'

  return (
    <div className="chat-root">
      <header className="chat-header">
        <h1>MilesVault chat</h1>
        <span className="chat-user">{userEmail}</span>
      </header>

      <main className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            Describe a transaction in plain language. Example: <em>&ldquo;Dinner at Someplace for ₹1500 on Infinia, earned 50 SmartBuy points&rdquo;</em>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
            <div className="chat-msg-role">{m.role === 'user' ? 'You' : 'Assistant'}</div>
            <div className="chat-msg-body">
              {m.parts.map((part, i) => {
                if (part.type === 'text') {
                  return (
                    <p key={i} className="chat-text">
                      {part.text}
                    </p>
                  )
                }
                if (part.type === 'tool-createTxn') {
                  const key = `${m.id}-${i}`
                  if (part.state === 'input-streaming' || part.state === 'input-available') {
                    return (
                      <TxnEditCard
                        key={key}
                        initialDraft={part.input as any}
                        locked={part.state === 'input-streaming'}
                      />
                    )
                  }
                  if (part.state === 'output-available') {
                    return (
                      <TxnEditCard
                        key={key}
                        initialDraft={part.input as any}
                      />
                    )
                  }
                  if (part.state === 'output-error') {
                    return (
                      <div key={key} className="chat-tool-error">
                        Tool error: {part.errorText}
                      </div>
                    )
                  }
                }
                return null
              })}
            </div>
          </div>
        ))}
        {isBusy && <div className="chat-busy">thinking…</div>}
        {error && <div className="chat-error">Error: {error.message}</div>}
      </main>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          if (!input.trim() || isBusy) return
          sendMessage({ text: input })
          setInput('')
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Log a transaction…"
          disabled={isBusy}
          autoFocus
        />
        <button type="submit" disabled={isBusy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
