'use client'

import { createContext, useContext } from 'react'

type SendMessageFn = (msg: { text: string }) => void | Promise<void>

export type ChatActions = {
  sendMessage: SendMessageFn
  busy: boolean
}

export const ChatActionsContext = createContext<ChatActions | null>(null)

export function useChatActions(): ChatActions {
  const ctx = useContext(ChatActionsContext)
  if (!ctx) {
    throw new Error('useChatActions must be used inside ChatActionsContext')
  }
  return ctx
}
