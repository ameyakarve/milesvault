import type {
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

// Marker-less header: NIM occasionally strips EVERY envelope marker, including
// `<|tool_call_end|>`. The header `functions.<name>:<idx>` + the JSON object
// then flow through as plain text. We require the `functions.` prefix here to
// avoid matching unrelated `name:0` text; the closing is found by a
// balanced-brace scan over the following `{...}`.
const MARKERLESS_RE =
  /functions\.([A-Za-z_][\w-]*):(\d+)\s*(?=\{)/g

const MARKER_SNIFF_RE =
  /(?:<\|tool_calls_section_begin\|>|<\|tool_call_begin\|>|<\|tool_call_argument_begin\|>|<\|tool_call_end\|>|<\|tool_calls_section_end\|>|functions\.[A-Za-z_][\w-]*:\d+\s*\{)/

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

function scanBalancedJson(
  text: string,
  start: number,
): { json: string; end: number } | null {
  if (text[start] !== '{') return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (esc) {
      esc = false
      continue
    }
    if (inStr) {
      if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return { json: text.slice(start, i + 1), end: i + 1 }
    }
  }
  return null
}

function extractEnvelope(
  text: string,
  knownToolNames: ReadonlySet<string>,
): Rescued {
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
  cleaned += text.slice(lastIndex)
  return { cleanedText: cleaned, toolCalls }
}

function extractMarkerless(
  text: string,
  knownToolNames: ReadonlySet<string>,
): Rescued {
  const toolCalls: LanguageModelV3ToolCall[] = []
  let cleaned = ''
  let lastIndex = 0
  MARKERLESS_RE.lastIndex = 0
  for (let m = MARKERLESS_RE.exec(text); m !== null; m = MARKERLESS_RE.exec(text)) {
    const [full, name] = m
    const jsonStart = m.index + full.length
    // Skip whitespace between header and `{` — RE's `\s*(?=\{)` already does
    // this via lookahead, so text[jsonStart] should already be '{'. Be safe.
    let braceIdx = jsonStart
    while (braceIdx < text.length && text[braceIdx] !== '{') braceIdx++
    if (!knownToolNames.has(name)) {
      cleaned += text.slice(lastIndex, jsonStart)
      lastIndex = jsonStart
      continue
    }
    const scan = scanBalancedJson(text, braceIdx)
    if (!scan) {
      cleaned += text.slice(lastIndex, jsonStart)
      lastIndex = jsonStart
      continue
    }
    try {
      JSON.parse(scan.json)
    } catch {
      cleaned += text.slice(lastIndex, scan.end)
      lastIndex = scan.end
      continue
    }
    cleaned += text.slice(lastIndex, m.index)
    // Consume optional trailing `<|tool_call_end|>` (partial-envelope case
    // where only the closing marker survived).
    let after = scan.end
    if (text.startsWith('<|tool_call_end|>', after)) {
      after += '<|tool_call_end|>'.length
    }
    lastIndex = after
    toolCalls.push({
      type: 'tool-call',
      toolCallId: allocId(name),
      toolName: name,
      input: scan.json,
    })
    MARKERLESS_RE.lastIndex = after
  }
  cleaned += text.slice(lastIndex)
  return { cleanedText: cleaned, toolCalls }
}

function rescueFromText(
  text: string,
  knownToolNames: ReadonlySet<string>,
): Rescued | null {
  if (!MARKER_SNIFF_RE.test(text)) return null
  const first = extractEnvelope(text, knownToolNames)
  const second = extractMarkerless(first.cleanedText, knownToolNames)
  const toolCalls = [...first.toolCalls, ...second.toolCalls]
  if (toolCalls.length === 0) return null
  const cleaned = second.cleanedText
    .split(SECTION_END)
    .join('')
    .replace(/\s+$/g, '')
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
      if (part.type === 'tool-call') {
        newContent.push({ ...part, toolCallId: allocId(part.toolName) })
        mutated = true
        continue
      }
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

    type TextRun = {
      id: string
      held: string
      startEmitted: boolean
      startPart: LanguageModelV3StreamPart & { type: 'text-start' }
    }
    const runs = new Map<string, TextRun>()
    // Remap native (provider-emitted) tool_call ids to unique ones so turn-local
    // `:0/:1` collisions can't poison `processedToolCalls`.
    const nativeIdMap = new Map<string, string>()
    const remap = (srcId: string, toolName: string): string => {
      let mapped = nativeIdMap.get(srcId)
      if (!mapped) {
        mapped = allocId(toolName)
        nativeIdMap.set(srcId, mapped)
      }
      return mapped
    }
    let rescuedAny = false
    let rescuedCount = 0
    let sawToolCallFromProvider = false

    const transform = new TransformStream<
      LanguageModelV3StreamPart,
      LanguageModelV3StreamPart
    >({
      transform(part, controller) {
        switch (part.type) {
          case 'text-start':
            runs.set(part.id, {
              id: part.id,
              held: '',
              startEmitted: false,
              startPart: part,
            })
            return
          case 'text-delta': {
            const run = runs.get(part.id)
            if (!run) {
              controller.enqueue(part)
              return
            }
            // Buffer until text-end. NIM's `kimi_k2_tool_parser` can strip
            // opening markers while leaking closing ones and the
            // `functions.<name>:<idx>` header as plain content — so the leak
            // isn't anchored by any `<|` that could serve as a streaming
            // sentinel. Buffering defers rescue until we have the full text.
            run.held += part.delta
            return
          }
          case 'text-end': {
            const run = runs.get(part.id)
            runs.delete(part.id)
            if (!run) {
              controller.enqueue(part)
              return
            }
            const rescued = rescueFromText(run.held, names)
            if (!rescued) {
              if (run.held.length > 0) {
                if (!run.startEmitted) {
                  controller.enqueue(run.startPart)
                  run.startEmitted = true
                }
                controller.enqueue({
                  type: 'text-delta',
                  id: run.id,
                  delta: run.held,
                })
              }
              if (run.startEmitted) {
                controller.enqueue({ type: 'text-end', id: run.id })
              }
              return
            }
            rescuedAny = true
            rescuedCount += rescued.toolCalls.length
            if (rescued.cleanedText.length > 0) {
              if (!run.startEmitted) {
                controller.enqueue(run.startPart)
                run.startEmitted = true
              }
              controller.enqueue({
                type: 'text-delta',
                id: run.id,
                delta: rescued.cleanedText,
              })
            }
            if (run.startEmitted) {
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
          case 'tool-input-start': {
            sawToolCallFromProvider = true
            const mapped = remap(part.id, part.toolName)
            controller.enqueue({ ...part, id: mapped })
            return
          }
          case 'tool-input-delta': {
            const mapped = nativeIdMap.get(part.id)
            controller.enqueue(mapped ? { ...part, id: mapped } : part)
            return
          }
          case 'tool-input-end': {
            const mapped = nativeIdMap.get(part.id)
            controller.enqueue(mapped ? { ...part, id: mapped } : part)
            return
          }
          case 'tool-call': {
            sawToolCallFromProvider = true
            const mapped = remap(part.toolCallId, part.toolName)
            controller.enqueue({ ...part, toolCallId: mapped })
            return
          }
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
        if (rescuedAny || nativeIdMap.size > 0) {
          console.warn(
            `[kimi-rescue] stream: rescued=${rescuedCount} nativeRemapped=${nativeIdMap.size}`,
          )
        }
      },
    })

    return { ...result, stream: result.stream.pipeThrough(transform) }
  },
}
