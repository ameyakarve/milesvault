import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3Middleware,
  LanguageModelV3StreamPart,
  LanguageModelV3ToolCall,
} from '@ai-sdk/provider'

const SECTION_END = '<|tool_calls_section_end|>'

// Matches a Kimi tool-call envelope, terminated by `<|tool_call_end|>`.
// Tolerates all documented + observed degradations:
//   - full envelope: `<|tool_call_begin|>functions.<name>:<idx><|tool_call_argument_begin|>{...}<|tool_call_end|>`
//   - missing leading `<|tool_call_begin|>`
//   - missing `functions.` prefix
//   - missing `<|tool_call_argument_begin|>` (NIM sometimes strips it; JSON
//     sits directly after `:<idx>` and before `<|tool_call_end|>`)
// Captured name is normalised by stripping the optional `functions.` prefix.
const ENVELOPE_RE =
  /(?:<\|tool_call_begin\|>)?(?:functions\.)?([A-Za-z_][\w-]*):(\d+)\s*(?:<\|tool_call_argument_begin\|>)?\s*([\s\S]*?)<\|tool_call_end\|>/g

const MARKER_SNIFF_RE =
  /(?:<\|tool_calls_section_begin\|>|<\|tool_call_begin\|>|<\|tool_call_argument_begin\|>|<\|tool_call_end\|>|<\|tool_calls_section_end\|>)/

// Matches the start of a beancount transaction header: `YYYY-MM-DD *`.
// Used to detect when Kimi replied with a draft in prose instead of calling
// propose_create / propose_update. If this fires and no tool_call was made,
// the turn is retried with a system nudge.
const BEANCOUNT_HEADER_RE = /^\s*\d{4}-\d{2}-\d{2}\s+\*\s+"/m

// Global monotonic counter for tool_call_id generation. Seeded with Date.now()
// only to avoid collisions with ids persisted in the session from prior isolate
// lifetimes (the model's native turn-local `:0, :1, …` emissions, now rewritten
// on ingest but previously stored as-is). Keeps the `functions.<name>:<idx>`
// shape so Kimi's Jinja template (`## Return of {{ tool_call_id }}`, vLLM
// accuracy blog RC#1) renders cleanly.
//
// Applied to BOTH rescued-from-text tool calls AND native OpenAI-format
// tool_calls returned by the provider (NIM's `kimi_k2_tool_parser`), because
// @cloudflare/ai-chat's `processedToolCalls` Set is keyed globally by
// toolCallId — turn-local `:0` collisions would skip `execute()` on turn 2
// and replay the prior turn's cached result.
let seq = Date.now()
function allocId(name: string): string {
  return `functions.${name}:${seq++}`
}

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
    const [full, rawName, , argJson] = m
    const name = rawName
    if (!knownToolNames.has(name)) {
      cleaned += text.slice(lastIndex, m.index + full.length)
      lastIndex = m.index + full.length
      continue
    }
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
      toolCallId: allocId(name),
      toolName: name,
      input: argJson,
    })
  }
  if (toolCalls.length === 0) return null
  cleaned += text.slice(lastIndex)
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

type ProcessedStream = {
  parts: LanguageModelV3StreamPart[]
  rescuedAny: boolean
  hadToolCall: boolean
  // Concatenation of all emitted text across runs — used to detect beancount
  // drafts emitted as prose.
  emittedText: string
}

async function processStream(
  stream: ReadableStream<LanguageModelV3StreamPart>,
  names: ReadonlySet<string>,
): Promise<ProcessedStream> {
  const out: LanguageModelV3StreamPart[] = []
  let rescuedAny = false
  let sawToolCallFromProvider = false
  let emittedText = ''

  type TextRun = {
    id: string
    held: string
    startEmitted: boolean
    startPart: LanguageModelV3StreamPart & { type: 'text-start' }
  }
  const runs = new Map<string, TextRun>()
  const nativeIdMap = new Map<string, string>()
  const remap = (srcId: string, toolName: string): string => {
    let mapped = nativeIdMap.get(srcId)
    if (!mapped) {
      mapped = allocId(toolName)
      nativeIdMap.set(srcId, mapped)
    }
    return mapped
  }

  const reader = stream.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    const part = value
    switch (part.type) {
      case 'text-start':
        runs.set(part.id, {
          id: part.id,
          held: '',
          startEmitted: false,
          startPart: part,
        })
        break
      case 'text-delta': {
        const run = runs.get(part.id)
        if (!run) {
          out.push(part)
          break
        }
        // Buffer everything until text-end. NIM's `kimi_k2_tool_parser` can
        // strip opening markers (<|tool_calls_section_begin|>,
        // <|tool_call_begin|>, <|tool_call_argument_begin|>) while leaking
        // closing markers and the header (`functions.<name>:<idx>`) as
        // plain content — so the leak isn't anchored by any `<|` that could
        // serve as a streaming sentinel. Buffering defers rescue until we
        // have the full text; the cost is that pure-prose replies render
        // after the last token rather than incrementally, which is
        // acceptable here (replies are one-line summaries). Native
        // provider-emitted tool_calls still stream.
        run.held += part.delta
        break
      }
      case 'text-end': {
        const run = runs.get(part.id)
        runs.delete(part.id)
        if (!run) {
          out.push(part)
          break
        }
        const rescued = rescueFromText(run.held, names)
        if (!rescued) {
          if (run.held.length > 0) {
            if (!run.startEmitted) {
              out.push(run.startPart)
              run.startEmitted = true
            }
            out.push({ type: 'text-delta', id: run.id, delta: run.held })
            emittedText += run.held
          }
          if (run.startEmitted) {
            out.push({ type: 'text-end', id: run.id })
          }
          break
        }
        rescuedAny = true
        if (rescued.cleanedText.length > 0) {
          if (!run.startEmitted) {
            out.push(run.startPart)
            run.startEmitted = true
          }
          out.push({
            type: 'text-delta',
            id: run.id,
            delta: rescued.cleanedText,
          })
          emittedText += rescued.cleanedText
        }
        if (run.startEmitted) {
          out.push({ type: 'text-end', id: run.id })
        }
        for (const tc of rescued.toolCalls) {
          out.push({
            type: 'tool-input-start',
            id: tc.toolCallId,
            toolName: tc.toolName,
          })
          out.push({
            type: 'tool-input-delta',
            id: tc.toolCallId,
            delta: tc.input,
          })
          out.push({ type: 'tool-input-end', id: tc.toolCallId })
          out.push(tc)
        }
        break
      }
      case 'tool-input-start': {
        sawToolCallFromProvider = true
        const mapped = remap(part.id, part.toolName)
        out.push({ ...part, id: mapped })
        break
      }
      case 'tool-input-delta': {
        const mapped = nativeIdMap.get(part.id)
        out.push(mapped ? { ...part, id: mapped } : part)
        break
      }
      case 'tool-input-end': {
        const mapped = nativeIdMap.get(part.id)
        out.push(mapped ? { ...part, id: mapped } : part)
        break
      }
      case 'tool-call': {
        sawToolCallFromProvider = true
        const mapped = remap(part.toolCallId, part.toolName)
        out.push({ ...part, toolCallId: mapped })
        break
      }
      case 'finish': {
        if (
          rescuedAny &&
          !sawToolCallFromProvider &&
          part.finishReason.unified !== 'tool-calls'
        ) {
          out.push({
            ...part,
            finishReason: {
              unified: 'tool-calls',
              raw: part.finishReason.raw,
            },
          })
        } else {
          out.push(part)
        }
        break
      }
      default:
        out.push(part)
    }
  }

  return {
    parts: out,
    rescuedAny,
    hadToolCall: rescuedAny || sawToolCallFromProvider,
    emittedText,
  }
}

const BEANCOUNT_NUDGE =
  'Your previous reply contained a beancount draft in plain text. That does NOT stage anything for the user — the Save button only appears after a successful propose_create or propose_update. Call propose_create now with that draft as the `raw_text` argument. Do not repeat the draft in your reply; after `{ok: true}` write only a one-line summary.'

function augmentWithNudge(
  params: LanguageModelV3CallOptions,
): LanguageModelV3CallOptions {
  return {
    ...params,
    prompt: [...params.prompt, { role: 'system', content: BEANCOUNT_NUDGE }],
  }
}

export const kimiRescueMiddleware: LanguageModelV3Middleware = {
  specificationVersion: 'v3',
  async wrapGenerate({ doGenerate, params, model }) {
    const result = await doGenerate()
    const names = knownToolNamesFromParams(
      params as { tools?: Array<{ type: string; name?: string }> },
    )
    if (names.size === 0) return result

    let mutated = false
    let hadToolCall = false
    let emittedText = ''
    const newContent: LanguageModelV3Content[] = []
    for (const part of result.content) {
      if (part.type === 'tool-call') {
        newContent.push({ ...part, toolCallId: allocId(part.toolName) })
        mutated = true
        hadToolCall = true
        continue
      }
      if (part.type !== 'text') {
        newContent.push(part)
        continue
      }
      const rescued = rescueFromText(part.text, names)
      if (!rescued) {
        newContent.push(part)
        emittedText += part.text
        continue
      }
      mutated = true
      hadToolCall = true
      if (rescued.cleanedText.length > 0) {
        newContent.push({ ...part, text: rescued.cleanedText })
        emittedText += rescued.cleanedText
      }
      for (const tc of rescued.toolCalls) newContent.push(tc)
    }

    const shouldRetry =
      !hadToolCall &&
      names.has('propose_create') &&
      BEANCOUNT_HEADER_RE.test(emittedText)

    if (shouldRetry) {
      console.warn(
        '[kimi-rescue] beancount draft without tool_call; retrying with nudge (generate)',
      )
      try {
        const retry = await model.doGenerate(augmentWithNudge(params))
        return retry
      } catch (e) {
        console.warn('[kimi-rescue] retry failed (generate)', String(e))
      }
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
  async wrapStream({ doStream, params, model }) {
    const result = await doStream()
    const names = knownToolNamesFromParams(
      params as { tools?: Array<{ type: string; name?: string }> },
    )
    if (names.size === 0) return result

    const outStream = new ReadableStream<LanguageModelV3StreamPart>({
      async start(controller) {
        try {
          const first = await processStream(result.stream, names)

          const shouldRetry =
            !first.hadToolCall &&
            names.has('propose_create') &&
            BEANCOUNT_HEADER_RE.test(first.emittedText)

          if (!shouldRetry) {
            if (first.rescuedAny) {
              console.warn(
                '[kimi-rescue] recovered tool-call(s) from leaked Kimi tokens (stream)',
              )
            }
            for (const p of first.parts) controller.enqueue(p)
            controller.close()
            return
          }

          console.warn(
            '[kimi-rescue] beancount draft without tool_call; retrying with nudge (stream)',
          )
          let retryResult: Awaited<ReturnType<typeof model.doStream>>
          try {
            retryResult = await model.doStream(augmentWithNudge(params))
          } catch (e) {
            console.warn('[kimi-rescue] retry failed, falling back to original', String(e))
            for (const p of first.parts) controller.enqueue(p)
            controller.close()
            return
          }

          const second = await processStream(retryResult.stream, names)
          if (second.hadToolCall) {
            console.warn('[kimi-rescue] retry produced tool_call; emitting retry stream')
            for (const p of second.parts) controller.enqueue(p)
          } else {
            console.warn(
              '[kimi-rescue] retry still produced no tool_call; falling back to first attempt',
            )
            for (const p of first.parts) controller.enqueue(p)
          }
          controller.close()
        } catch (e) {
          controller.error(e)
        }
      },
    })

    return { ...result, stream: outStream }
  },
}
