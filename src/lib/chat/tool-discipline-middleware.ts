import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
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
  /**
   * Name of the tool that carries user-facing text (e.g. `reply`). The
   * retry is considered successful only if this specific tool was called
   * — if the retry produces some other tool instead, we fall back to the
   * first (text-only) stream so the agent loop terminates naturally
   * instead of chasing the wrong tool across multiple steps.
   */
  replyToolName: string
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

      const firstSummary = summarizeContent(result.content)
      if (
        firstSummary.calledTools.size > 0 ||
        firstSummary.emittedText.trim().length === 0
      ) {
        return result
      }

      console.warn(
        `[${prefix}] model emitted free-form text with no tool_call; retrying with nudge (generate)`,
      )
      let retry: Awaited<ReturnType<typeof model.doGenerate>>
      try {
        retry = await model.doGenerate(withNudge(params, opts.nudge))
      } catch (e) {
        console.warn(`[${prefix}] retry failed, falling back to original`, String(e))
        return result
      }

      const retrySummary = summarizeContent(retry.content)
      if (retrySummary.calledTools.has(opts.replyToolName)) {
        console.warn(
          `[${prefix}] retry produced "${opts.replyToolName}"; using retry result`,
        )
        return retry
      }
      console.warn(
        `[${prefix}] retry did not call "${opts.replyToolName}" (called: ${[...retrySummary.calledTools].join(',') || 'none'}); falling back to first attempt to let the loop terminate`,
      )
      return result
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
            if (second.calledTools.has(opts.replyToolName)) {
              console.warn(
                `[${prefix}] retry produced "${opts.replyToolName}"; emitting retry stream`,
              )
              for (const p of second.parts) controller.enqueue(p)
            } else {
              console.warn(
                `[${prefix}] retry did not call "${opts.replyToolName}" (called: ${[...second.calledTools].join(',') || 'none'}); falling back to first attempt to let the loop terminate`,
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

function summarizeContent(content: readonly LanguageModelV3Content[]): {
  calledTools: Set<string>
  emittedText: string
} {
  const calledTools = new Set<string>()
  let emittedText = ''
  for (const part of content) {
    if (part.type === 'tool-call') calledTools.add(part.toolName)
    else if (part.type === 'text') emittedText += part.text
  }
  return { calledTools, emittedText }
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
  calledTools: Set<string>
  emittedText: string
}

async function consume(
  stream: ReadableStream<LanguageModelV3StreamPart>,
): Promise<Consumed> {
  const parts: LanguageModelV3StreamPart[] = []
  const calledTools = new Set<string>()
  let emittedText = ''
  const reader = stream.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    parts.push(value)
    switch (value.type) {
      case 'tool-call':
        calledTools.add(value.toolName)
        break
      case 'tool-input-start':
        calledTools.add(value.toolName)
        break
      case 'text-delta':
        emittedText += value.delta
        break
    }
  }
  return { parts, hadToolCall: calledTools.size > 0, calledTools, emittedText }
}
