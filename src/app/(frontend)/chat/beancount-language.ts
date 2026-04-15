import {
  HighlightStyle,
  LanguageSupport,
  LRLanguage,
  syntaxHighlighting,
} from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { parser } from 'lezer-beancount'

const beancountLanguage = LRLanguage.define({
  name: 'beancount',
  parser,
  languageData: {
    commentTokens: { line: ';' },
  },
})

const beancountHighlightStyle = HighlightStyle.define([
  { tag: t.lineComment, color: '#546e7a', fontStyle: 'italic' },
  { tag: t.string, color: '#a5e844' },
  { tag: t.number, color: '#f78c6c' },
  { tag: t.literal, color: '#ffcb6b' },
  { tag: t.bool, color: '#f78c6c' },
  { tag: t.variableName, color: '#82aaff' },
  { tag: t.unit, color: '#89ddff' },
  { tag: t.modifier, color: '#c792ea', fontWeight: 'bold' },
  { tag: t.keyword, color: '#c792ea' },
  { tag: t.tagName, color: '#ff5370' },
  { tag: t.link, color: '#ff5370' },
  { tag: t.propertyName, color: '#b2ccd6', fontStyle: 'italic' },
  { tag: [t.operator, t.arithmeticOperator], color: '#89ddff' },
  { tag: [t.brace, t.paren, t.separator, t.punctuation], color: '#545a70' },
  { tag: t.heading, color: '#c792ea', fontWeight: 'bold' },
])

export const beancountSupport = new LanguageSupport(beancountLanguage, [
  syntaxHighlighting(beancountHighlightStyle),
])
