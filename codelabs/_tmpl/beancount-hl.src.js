// Static beancount syntax highlighter for the codelabs — reuses the SAME
// grammar (lezer-beancount) and tag→token mapping as the app's Journal editor,
// so code blocks match it exactly. Bundled by codelabs/build.sh via esbuild.
import { parser as base } from 'lezer-beancount'
import { styleTags, tags as t, tagHighlighter, highlightTree } from '@lezer/highlight'

const parser = base.configure({
  props: [
    styleTags({
      Date: t.literal,
      TxnFlag: t.operator,
      String: t.string,
      Account: t.variableName,
      Number: t.number,
      Currency: t.unit,
      'Comment LineComment': t.lineComment,
    }),
  ],
})

const highlighter = tagHighlighter([
  { tag: t.literal, class: 'bc-date' },
  { tag: t.operator, class: 'bc-flag' },
  { tag: t.string, class: 'bc-string' },
  { tag: t.variableName, class: 'bc-account' },
  { tag: t.number, class: 'bc-number' },
  { tag: t.unit, class: 'bc-currency' },
  { tag: t.lineComment, class: 'bc-comment' },
])

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function render(code) {
  const tree = parser.parse(code)
  let out = '',
    pos = 0
  highlightTree(tree, highlighter, (from, to, cls) => {
    if (from > pos) out += esc(code.slice(pos, from))
    out += '<span class="' + cls + '">' + esc(code.slice(from, to)) + '</span>'
    pos = to
  })
  out += esc(code.slice(pos))
  return out
}

function run() {
  document.querySelectorAll('google-codelab-step pre code').forEach((code) => {
    if (code.dataset.bcHl) return
    const cls = code.getAttribute('class') || ''
    if (!/beancount/.test(cls)) return
    code.innerHTML = render(code.textContent)
    code.dataset.bcHl = '1'
  })
}

window.addEventListener('load', () => {
  run()
  setTimeout(run, 900) // catch late hydration / re-render
})
