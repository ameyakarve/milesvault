/**
 * Custom fetch wrapper for the OpenAI-compatible NIM endpoint that normalizes
 * outgoing chat-completion requests so NIM's vLLM `kimi_k2` Jinja template
 * renders cleanly.
 *
 * Root cause #2 from the vLLM Kimi K2 accuracy blog
 * (https://vllm.ai/blog/Kimi-K2-Accuracy):
 *
 *   > When an assistant message has only tool_calls and no text, the SDK
 *   > serializes `content: ""`. vLLM then converts that to
 *   > `[{type:'text', text:''}]` when rendering the chat template, which
 *   > breaks the Kimi Jinja template — downstream model responses come back
 *   > empty and self-correction loops stall.
 *
 * Fix: when an assistant message carries `tool_calls` and its `content` is
 * the empty string, drop the `content` key entirely. vLLM treats the missing
 * field as null and renders the template correctly.
 */
export function withNimRequestNormalize(
  base: typeof fetch = globalThis.fetch,
): typeof fetch {
  return async (input, init) => {
    if (!init || init.method !== 'POST' || typeof init.body !== 'string') {
      return base(input, init)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(init.body)
    } catch {
      return base(input, init)
    }
    if (!isChatRequest(parsed)) return base(input, init)
    let mutated = false
    for (const msg of parsed.messages) {
      if (
        msg &&
        typeof msg === 'object' &&
        (msg as { role?: unknown }).role === 'assistant' &&
        Array.isArray((msg as { tool_calls?: unknown }).tool_calls) &&
        ((msg as { tool_calls?: unknown[] }).tool_calls?.length ?? 0) > 0 &&
        (msg as { content?: unknown }).content === ''
      ) {
        delete (msg as { content?: unknown }).content
        mutated = true
      }
    }
    if (!mutated) return base(input, init)
    return base(input, { ...init, body: JSON.stringify(parsed) })
  }
}

function isChatRequest(v: unknown): v is { messages: unknown[] } {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as { messages?: unknown }).messages)
  )
}
