import type { CardPattern, ParsedTxn } from './types'

function ComplexCard({ parsed }: { parsed: ParsedTxn }) {
  return (
    <article className="border-b border-zinc-100 px-3 py-3 hover:bg-zinc-50 transition-colors">
      <pre className="font-mono text-[12px] leading-[1.5] text-[#09090B] whitespace-pre-wrap m-0">
        {parsed.raw}
      </pre>
    </article>
  )
}

export const complexPattern: CardPattern = {
  name: 'complex',
  tryRender: (parsed) => <ComplexCard parsed={parsed} />,
}
