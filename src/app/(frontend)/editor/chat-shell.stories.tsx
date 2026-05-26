import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'

function ChatShell() {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-3xl">
          <ConversationEmptyState
            title="How can I help?"
            description="Ask anything about your finances."
          />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="sticky bottom-0 z-10 mx-auto flex w-full max-w-3xl gap-2 bg-background px-2 pb-3 md:px-4 md:pb-4">
        <PromptInput onSubmit={() => {}} className="w-full">
          <PromptInputTextarea placeholder="Message…" />
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit status={undefined} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

const meta: Meta<typeof ChatShell> = {
  title: 'Editor/ChatShell',
  component: ChatShell,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-screen flex-col bg-white">
        <Story />
      </div>
    ),
  ],
}
export default meta

export const Default: StoryObj<typeof ChatShell> = {}
