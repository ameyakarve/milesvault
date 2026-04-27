import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { NotebookShell } from './notebook-shell'

const TALL_TEXT = Array.from({ length: 200 }, (_, i) => `2026-04-${String((i % 28) + 1).padStart(2, '0')} * "Line ${i}"`).join('\n')

const THEME = EditorView.theme({
  '&': { height: '100%' },
  '.cm-line': { lineHeight: '28px' },
})

function Body() {
  return (
    <div className="h-full flex flex-col min-h-0 py-4 px-6" data-testid="body-root">
      <div className="flex-1 min-h-0 bg-white rounded-sm shadow-sm border border-[#bcc9c6]/15 overflow-hidden" data-testid="editor-wrapper">
        <CodeMirror
          value={TALL_TEXT}
          extensions={[THEME, EditorView.lineWrapping]}
          height="100%"
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )
}

const meta: Meta = {
  title: 'Ledger / NotebookShell Scroll',
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
}
export default meta

export const Tall: StoryObj = {
  render: () => (
    <NotebookShell
      breadcrumb={['Test']}
      accountTitle="Scroll Test"
      accountPath="Test:Scroll"
      balance="0"
      cards={[]}
      txnCount={0}
      body={<Body />}
    />
  ),
}
