import type {
  LanguageModelV3Content,
  LanguageModelV3FunctionTool,
  LanguageModelV3StreamPart,
  LanguageModelV3ToolCall,
} from '@ai-sdk/provider'
import type { TCMProtocol } from '@ai-sdk-tool/parser'

const SECTION_START = '<|tool_calls_section_begin|>'
const SECTION_END = '<|tool_calls_section_end|>'
const CALL_START = '<|tool_call_begin|>'
const CALL_END = '<|tool_call_end|>'
const ARG_START = '<|tool_call_argument_begin|>'

const KIMI_CALL_RE = new RegExp(
  `${escape(CALL_START)}\\s*([\\w\\.]+:\\d+)\\s*${escape(ARG_START)}\\s*([\\s\\S]*?)\\s*${escape(CALL_END)}`,
  'g',
)
const KIMI_SECTION_RE = new RegExp(
  `${escape(SECTION_START)}[\\s\\S]*?${escape(SECTION_END)}`,
  'g',
)
const PY_BLOCK_RE = /```python\s*\n([\s\S]*?)\n```/g
const PY_CALL_RE = /^\s*([A-Za-z_][\w]*)\s*\(\s*([\s\S]*?)\s*\)\s*$/

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractKimiToolCalls(
  text: string,
  tools: LanguageModelV3FunctionTool[],
): { calls: LanguageModelV3ToolCall[]; cleaned: string } {
  const toolNames = new Set(tools.map((t) => t.name))
  const calls: LanguageModelV3ToolCall[] = []
  let idx = 0
  let cleaned = text

  cleaned = cleaned.replace(KIMI_SECTION_RE, (section) => {
    let m: RegExpExecArray | null
    const re = new RegExp(KIMI_CALL_RE.source, 'g')
    while ((m = re.exec(section)) !== null) {
      const rawId = m[1]
      const argBody = m[2]
      const name = rawId.split('.').pop()?.split(':')[0] ?? rawId
      if (!toolNames.has(name)) continue
      calls.push({
        type: 'tool-call',
        toolCallId: `kimi_${idx++}_${rawId.replace(/[^\w]/g, '_')}`,
        toolName: name,
        input: normalizeJson(argBody),
      })
    }
    return ''
  })

  cleaned = cleaned.replace(PY_BLOCK_RE, (block, body: string) => {
    const m = PY_CALL_RE.exec(body.trim())
    if (!m) return block
    const [, name, argsStr] = m
    if (!toolNames.has(name)) return block
    const parsed = parsePythonKwargs(argsStr)
    if (!parsed) return block
    calls.push({
      type: 'tool-call',
      toolCallId: `kimi_py_${idx++}_${name}`,
      toolName: name,
      input: JSON.stringify(parsed),
    })
    return ''
  })

  return { calls, cleaned: cleaned.trim() }
}

function normalizeJson(s: string): string {
  const trimmed = s.trim()
  try {
    return JSON.stringify(JSON.parse(trimmed))
  } catch {
    return trimmed
  }
}

function parsePythonKwargs(src: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  let i = 0
  const n = src.length
  while (i < n) {
    while (i < n && /\s/.test(src[i])) i++
    if (i >= n) break
    const nameStart = i
    while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++
    const key = src.slice(nameStart, i)
    if (!key) return null
    while (i < n && /\s/.test(src[i])) i++
    if (src[i] !== '=') return null
    i++
    while (i < n && /\s/.test(src[i])) i++
    const valueResult = readPythonValue(src, i)
    if (!valueResult) return null
    out[key] = valueResult.value
    i = valueResult.next
    while (i < n && /\s/.test(src[i])) i++
    if (i < n && src[i] === ',') i++
  }
  return out
}

function readPythonValue(src: string, start: number): { value: unknown; next: number } | null {
  const n = src.length
  let i = start
  if (i >= n) return null
  const ch = src[i]
  if (ch === '"' || ch === "'") {
    return readPythonString(src, i)
  }
  if (src.startsWith('True', i)) return { value: true, next: i + 4 }
  if (src.startsWith('False', i)) return { value: false, next: i + 5 }
  if (src.startsWith('None', i)) return { value: null, next: i + 4 }
  const numMatch = /^-?\d+(\.\d+)?/.exec(src.slice(i))
  if (numMatch) return { value: Number(numMatch[0]), next: i + numMatch[0].length }
  return null
}

function readPythonString(src: string, start: number): { value: string; next: number } | null {
  const n = src.length
  const quote = src[start]
  const isTriple =
    src[start + 1] === quote && src[start + 2] === quote
  const delim = isTriple ? src.slice(start, start + 3) : quote
  let i = start + delim.length
  let out = ''
  while (i < n) {
    const c = src[i]
    if (c === '\\' && i + 1 < n) {
      const next = src[i + 1]
      const map: Record<string, string> = {
        n: '\n',
        t: '\t',
        r: '\r',
        '\\': '\\',
        "'": "'",
        '"': '"',
        '0': '\0',
      }
      out += map[next] ?? next
      i += 2
      continue
    }
    if (isTriple && src.startsWith(delim, i)) {
      return { value: out, next: i + delim.length }
    }
    if (!isTriple && c === quote) {
      return { value: out, next: i + 1 }
    }
    out += c
    i++
  }
  return null
}

export function kimiProtocol(): TCMProtocol {
  return {
    formatTools({ tools, toolSystemPromptTemplate }) {
      return toolSystemPromptTemplate(tools)
    },
    formatToolCall(toolCall) {
      const args = typeof toolCall.input === 'string' ? toolCall.input : JSON.stringify(toolCall.input)
      return `${SECTION_START}${CALL_START}functions.${toolCall.toolName}:0${ARG_START}${args}${CALL_END}${SECTION_END}`
    },
    parseGeneratedText({ text, tools }) {
      const { calls, cleaned } = extractKimiToolCalls(text, tools)
      const parts: LanguageModelV3Content[] = []
      if (cleaned.length > 0) parts.push({ type: 'text', text: cleaned })
      for (const c of calls) parts.push(c)
      return parts
    },
    createStreamParser({ tools }) {
      let buffer = ''
      let textId: string | null = null
      let emittedAny = false

      const ensureText = (controller: TransformStreamDefaultController<LanguageModelV3StreamPart>) => {
        if (textId) return textId
        textId = `kimi-text-${Math.random().toString(36).slice(2, 10)}`
        controller.enqueue({ type: 'text-start', id: textId })
        return textId
      }
      const closeText = (controller: TransformStreamDefaultController<LanguageModelV3StreamPart>) => {
        if (textId) {
          controller.enqueue({ type: 'text-end', id: textId })
          textId = null
        }
      }

      const flushSafeText = (
        controller: TransformStreamDefaultController<LanguageModelV3StreamPart>,
      ) => {
        if (buffer.length === 0) return
        const earliestMarkerIdx = findEarliestStartMarker(buffer)
        const safeUpto = earliestMarkerIdx === -1 ? buffer.length : earliestMarkerIdx
        if (safeUpto > 0) {
          const safe = buffer.slice(0, safeUpto)
          buffer = buffer.slice(safeUpto)
          const id = ensureText(controller)
          controller.enqueue({ type: 'text-delta', id, delta: safe })
          emittedAny = true
        }
      }

      return new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
        transform(chunk, controller) {
          if (chunk.type === 'text-start' || chunk.type === 'text-end') return
          if (chunk.type === 'text-delta') {
            buffer += chunk.delta
            flushSafeText(controller)
            return
          }
          if (chunk.type === 'finish') {
            const { calls, cleaned } = extractKimiToolCalls(buffer, tools)
            buffer = ''
            if (cleaned.length > 0) {
              const id = ensureText(controller)
              controller.enqueue({ type: 'text-delta', id, delta: cleaned })
              emittedAny = true
            }
            closeText(controller)
            for (const c of calls) controller.enqueue(c)
            if (calls.length > 0) {
              controller.enqueue({
                ...chunk,
                finishReason: { unified: 'tool-calls', raw: chunk.finishReason?.raw },
              })
            } else {
              if (!emittedAny) {
                const id = ensureText(controller)
                controller.enqueue({ type: 'text-delta', id, delta: '' })
                closeText(controller)
              }
              controller.enqueue(chunk)
            }
            return
          }
          controller.enqueue(chunk)
        },
      })
    },
    extractToolCallSegments({ text }) {
      const segments: string[] = []
      let m: RegExpExecArray | null
      const re = new RegExp(KIMI_SECTION_RE.source, 'g')
      while ((m = re.exec(text)) !== null) segments.push(m[0])
      const py = new RegExp(PY_BLOCK_RE.source, 'g')
      while ((m = py.exec(text)) !== null) segments.push(m[0])
      return segments
    },
  }
}

function findEarliestStartMarker(buf: string): number {
  const candidates = ['<|', '```python']
  let best = -1
  for (const c of candidates) {
    const idx = buf.indexOf(c)
    if (idx !== -1 && (best === -1 || idx < best)) best = idx
  }
  return best
}
