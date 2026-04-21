import type {
  LanguageModelV3Content,
  LanguageModelV3Middleware,
  LanguageModelV3StreamPart,
  LanguageModelV3ToolCall,
} from '@ai-sdk/provider'

const ARG_BEGIN = '<|tool_call_argument_begin|>'
const CALL_END = '<|tool_call_end|>'
const SECTION_END = '<|tool_calls_section_end|>'

// Matches `<|tool_call_argument_begin|>{json}<|tool_call_end|>` blocks and
// captures the id-ish token immediately preceding. Tolerates:
//   - full envelope: `<|tool_call_begin|>functions.<name>:<idx><|tool_call_argument_begin|>...`
//   - prefix-less:   `<name>:<idx><|tool_call_argument_begin|>...`
//   - missing `<|tool_calls_section_begin|>` entirely
// Captured name is normalised by stripping an optional `functions.` prefix.
const ENVELOPE_RE =
  /(?:<\|tool_call_begin\|>)?(?:functions\.)?([A-Za-z_][\w-]*):(\d+)\s*<\|tool_call_argument_begin\|>([\s\S]*?)<\|tool_call_end\|>/g

const MARKER_SNIFF_RE =
  /(?:<\|tool_calls_section_begin\|>|<\|tool_call_begin\|>|<\|tool_call_argument_begin\|>)/

type Rescued = {
  cleanedText: string
  toolCalls: LanguageModelV3ToolCall[]
}

function rescueFromText(
  text: string,
  knownToolNames: ReadonlySet<string>,
): Rescued | null {
  if (!MARKER_SNIFF_RE.test(text)) return null
  const toolCalls: LanguageModelV3ToolCall[] = []
  let cleaned = ''
  let lastIndex = 0
  ENVELOPE_RE.lastIndex = 0
  for (let m = ENVELOPE_RE.exec(text); m !== null; m = ENVELOPE_RE.exec(text)) {
    const [full, rawName, idx, argJson] = m
    const name = rawName
    if (!knownToolNames.has(name)) {
      // Unknown tool — leave the raw text alone rather than fabricate a call.
      cleaned += text.slice(lastIndex, m.index + full.length)
      lastIndex = m.index + full.length
      continue
    }
    // Validate JSON — if broken, skip rescue for this block.
    try {
      JSON.parse(argJson)
    } catch {
      cleaned += text.slice(lastIndex, m.index + full.length)
      lastIndex = m.index + full.length
      continue
    }
    cleaned += text.slice(lastIndex, m.index)
    lastIndex = m.index + full.length
    toolCalls.push({
      type: 'tool-call',
      toolCallId: `functions.${name}:${idx}`,
      toolName: name,
      input: argJson,
    })
  }
  if (toolCalls.length === 0) return null
  cleaned += text.slice(lastIndex)
  // Strip residual section-end markers and tidy whitespace.
  cleaned = cleaned.split(SECTION_END).join('').replace(/\s+$/g, '')
  return { cleanedText: cleaned, toolCalls }
}

function knownToolNamesFromParams(params: {
  tools?: Array<{ type: string; name?: string }>
}): Set<string> {
  const out = new Set<string>()
  for (const t of params.tools ?? []) {
    if (t && typeof t === 'object' && 'name' in t && typeof t.name === 'string') {
      out.add(t.name)
    }
  }
  return out
}

export const kimiRescueMiddleware: LanguageModelV3Middleware = {
  specificationVersion: 'v3',
  async wrapGenerate({ doGenerate, params }) {
    const result = await doGenerate()
    const names = knownToolNamesFromParams(
      params as { tools?: Array<{ type: string; name?: string }> },
    )
    if (names.size === 0) return result
    let mutated = false
    const newContent: LanguageModelV3Content[] = []
    for (const part of result.content) {
      if (part.type !== 'text') {
        newContent.push(part)
        continue
      }
      const rescued = rescueFromText(part.text, names)
      if (!rescued) {
        newContent.push(part)
        continue
      }
      mutated = true
      if (rescued.cleanedText.length > 0) {
        newContent.push({ ...part, text: rescued.cleanedText })
      }
      for (const tc of rescued.toolCalls) newContent.push(tc)
    }
    if (!mutated) return result
    console.warn(
      `[kimi-rescue] recovered ${newContent.filter((p) => p.type === 'tool-call').length} tool-call(s) from leaked Kimi tokens (generate)`,
    )
    const finishReason =
      result.finishReason.unified === 'stop' || result.finishReason.unified === 'length'
        ? { unified: 'tool-calls' as const, raw: result.finishReason.raw }
        : result.finishReason
    return { ...result, content: newContent, finishReason }
  },
  async wrapStream({ doStream, params }) {
    const result = await doStream()
    const names = knownToolNamesFromParams(
      params as { tools?: Array<{ type: string; name?: string }> },
    )
    if (names.size === 0) return result

    type TextRun = { id: string; buffer: string }
    const runs = new Map<string, TextRun>()
    let rescuedAny = false
    let sawToolCallFromProvider = false

    const transform = new TransformStream<
      LanguageModelV3StreamPart,
      LanguageModelV3StreamPart
    >({
      transform(part, controller) {
        switch (part.type) {
          case 'text-start':
            runs.set(part.id, { id: part.id, buffer: '' })
            // Defer emitting text-start until we know whether to rescue.
            return
          case 'text-delta': {
            const run = runs.get(part.id)
            if (run) {
              run.buffer += part.delta
              return
            }
            controller.enqueue(part)
            return
          }
          case 'text-end': {
            const run = runs.get(part.id)
            runs.delete(part.id)
            if (!run) {
              controller.enqueue(part)
              return
            }
            const rescued = rescueFromText(run.buffer, names)
            if (!rescued) {
              // Flush as a normal text block.
              controller.enqueue({ type: 'text-start', id: run.id })
              if (run.buffer.length > 0) {
                controller.enqueue({
                  type: 'text-delta',
                  id: run.id,
                  delta: run.buffer,
                })
              }
              controller.enqueue({ type: 'text-end', id: run.id })
              return
            }
            rescuedAny = true
            if (rescued.cleanedText.length > 0) {
              controller.enqueue({ type: 'text-start', id: run.id })
              controller.enqueue({
                type: 'text-delta',
                id: run.id,
                delta: rescued.cleanedText,
              })
              controller.enqueue({ type: 'text-end', id: run.id })
            }
            for (const tc of rescued.toolCalls) {
              controller.enqueue({
                type: 'tool-input-start',
                id: tc.toolCallId,
                toolName: tc.toolName,
              })
              controller.enqueue({
                type: 'tool-input-delta',
                id: tc.toolCallId,
                delta: tc.input,
              })
              controller.enqueue({ type: 'tool-input-end', id: tc.toolCallId })
              controller.enqueue(tc)
            }
            return
          }
          case 'tool-call':
          case 'tool-input-start':
            sawToolCallFromProvider = true
            controller.enqueue(part)
            return
          case 'finish': {
            if (
              rescuedAny &&
              !sawToolCallFromProvider &&
              part.finishReason.unified !== 'tool-calls'
            ) {
              controller.enqueue({
                ...part,
                finishReason: {
                  unified: 'tool-calls',
                  raw: part.finishReason.raw,
                },
              })
              return
            }
            controller.enqueue(part)
            return
          }
          default:
            controller.enqueue(part)
            return
        }
      },
      flush() {
        if (rescuedAny) {
          console.warn('[kimi-rescue] recovered tool-call(s) from leaked Kimi tokens (stream)')
        }
      },
    })

    return { ...result, stream: result.stream.pipeThrough(transform) }
  },
}
