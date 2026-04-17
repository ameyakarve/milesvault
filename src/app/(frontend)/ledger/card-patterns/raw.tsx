export function RawCard({ text }: { text: string }) {
  return (
    <article className="border-b border-zinc-100 px-3 py-3 hover:bg-zinc-50 transition-colors">
      <pre className="font-mono text-[12px] leading-[1.5] text-[#b91c1c] whitespace-pre-wrap m-0">
        {text}
      </pre>
    </article>
  )
}
