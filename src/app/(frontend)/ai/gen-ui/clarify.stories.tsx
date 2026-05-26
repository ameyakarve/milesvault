import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { ClarifyCard, type ClarifyCardProps } from './clarify'

const SINGLE: ClarifyCardProps['input'] = {
  question:
    'Was the 10% reduction applied to this bill, or does it come back later as cashback?',
  options: [
    'Applied to this bill (POS discount)',
    'Comes back later as cashback',
  ],
  multi_select: false,
  allow_custom: true,
}

function CardShell(props: Partial<ClarifyCardProps>) {
  const [status, setStatus] = useState<'idle' | 'done' | 'rejected'>(
    props.status ?? 'idle',
  )
  const [answers, setAnswers] = useState<string[]>(props.resolvedAnswers ?? [])
  return (
    <div className="min-h-screen bg-[#fbfbfa] p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-[12px] bg-slate-50 px-4 py-3 text-sm text-slate-900">
          <ClarifyCard
            input={SINGLE}
            onAnswer={(a) => {
              setAnswers(a)
              setStatus('done')
            }}
            onReject={() => setStatus('rejected')}
            {...props}
            status={status}
            resolvedAnswers={answers}
          />
        </div>
        {answers.length > 0 && (
          <pre className="overflow-x-auto rounded-[8px] border border-slate-200 bg-white p-3 text-[11px] text-slate-700">
            answers: {JSON.stringify(answers)}
          </pre>
        )}
      </div>
    </div>
  )
}

const meta: Meta<typeof CardShell> = {
  title: 'Chat/Clarify',
  component: CardShell,
  parameters: { layout: 'fullscreen' },
}
export default meta

export const SingleSelectWithCustom: StoryObj<typeof CardShell> = {}

export const SingleSelectNoCustom: StoryObj<typeof CardShell> = {
  args: {
    input: {
      question: 'Which card did you pay with?',
      options: ['HDFC Regalia', 'HSBC Cashback', 'Amex Platinum'],
      multi_select: false,
      allow_custom: false,
    },
  },
}

export const MultiSelect: StoryObj<typeof CardShell> = {
  args: {
    input: {
      question: 'Which categories should I attribute this dinner to?',
      options: ['Food', 'Entertainment', 'Travel', 'Business'],
      multi_select: true,
      allow_custom: true,
    },
  },
}

export const FreeTextOnly: StoryObj<typeof CardShell> = {
  args: {
    input: {
      question: 'What should I call this merchant?',
      options: [],
      multi_select: false,
      allow_custom: true,
    },
  },
}

export const Done: StoryObj<typeof CardShell> = {
  args: { status: 'done', resolvedAnswers: ['Applied to this bill (POS discount)'] },
}

export const Rejected: StoryObj<typeof CardShell> = {
  args: { status: 'rejected' },
}
