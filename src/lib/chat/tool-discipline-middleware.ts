import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Middleware,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider'

/**
 * Model-agnostic "must call a tool" retry middleware.
 *
 * Motivation: when the agent is given a dedicated conversational tool
 * (e.g. `reply`), every user-facing reply — chat, questions, summaries —
 * should arrive as a tool call, never as free-form assistant text. This
 * middleware catches the failure mode where the model emits text anyway
 * (ignoring the tool-shaped "chat" path) and retries the turn once with a
 * system nudge. Purely structural: it looks at whether any tool_call fired
 * and whether non-empty text was emitted — no content regex, no awareness
 * of the domain.
 *
 * Place as the OUTER wrapper so it sees post-rescue tool_calls from inner
 * provider-specific middleware (e.g. `kimiRescueMiddleware`):
 *
 *   wrapLanguageModel({ model, middleware: [toolDiscipline, kimiRescue] })
 *
 * (First array element is outermost in the AI SDK.)
 */
export function toolDisciplineMiddleware(opts: {
  /** System message appended on retry. Explain the blessed path. */
  nudge: string
  /** Logger prefix, purely cosmetic. Defaults to `tool-discipline`. */
  logPrefix?: string
}): LanguageModelV3Middleware {
  const prefix = opts.logPrefix ?? 'tool-discipline'

  return {
    specificationVersion: 'v3',
    async wrapGenerate({ doGenerate, params, model }) {
      const result = await doGenerate()
      if ((params.tools ?? []).length === 0) return result

      let hadToolCall = false
      let emittedText = ''
      for (const part of result.content) {
        if (part.type === 'tool-call') hadToolCall = true
        else if (part.type === 'text') emittedText += part.text
      }

      if (hadToolCall || emittedText.trim().length === 0) return result

      console.warn(
        `[${prefix}] model emitted free-form text with no tool_call; retrying with nudge (generate)`,
      )
      try {
        return await model.doGenerate(withNudge(params, opts.nudge))
      } catch (e) {
        console.warn(`[${prefix}] retry failed, falling back to original`, String(e))
        return result
      }
    },

    async wrapStream({ doStream, params, model }) {
      const result = await doStream()
      if ((params.tools ?? []).length === 0) return result

      const outStream = new ReadableStream<LanguageModelV3StreamPart>({
        async start(controller) {
          try {
            const first = await consume(result.stream)
            const shouldRetry =
              !first.hadToolCall && first.emittedText.trim().length > 0

            if (!shouldRetry) {
              for (const p of first.parts) controller.enqueue(p)
              controller.close()
              return
            }

            console.warn(
              `[${prefix}] model emitted free-form text with no tool_call; retrying with nudge (stream)`,
            )
            let retry: Awaited<ReturnType<typeof model.doStream>>
            try {
              retry = await model.doStream(withNudge(params, opts.nudge))
            } catch (e) {
              console.warn(`[${prefix}] retry failed, falling back to original`, String(e))
              for (const p of first.parts) controller.enqueue(p)
              controller.close()
              return
            }

            const second = await consume(retry.stream)
            if (second.hadToolCall) {
              console.warn(`[${prefix}] retry produced tool_call; emitting retry stream`)
              for (const p of second.parts) controller.enqueue(p)
            } else {
              console.warn(
                `[${prefix}] retry still emitted text without tool_call; falling back to first attempt`,
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
}

function withNudge(
  params: LanguageModelV3CallOptions,
  nudge: string,
): LanguageModelV3CallOptions {
  return {
    ...params,
    prompt: [...params.prompt, { role: 'system', content: nudge }],
  }
}

type Consumed = {
  parts: LanguageModelV3StreamPart[]
  hadToolCall: boolean
  emittedText: string
}

async function consume(
  stream: ReadableStream<LanguageModelV3StreamPart>,
): Promise<Consumed> {
  const parts: LanguageModelV3StreamPart[] = []
  let hadToolCall = false
  let emittedText = ''
  const reader = stream.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    parts.push(value)
    switch (value.type) {
      case 'tool-call':
      case 'tool-input-start':
        hadToolCall = true
        break
      case 'text-delta':
        emittedText += value.delta
        break
    }
  }
  return { parts, hadToolCall, emittedText }
}
