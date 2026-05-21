import type { Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = (err, request) => {
  const e = err as Error
  console.error(
    `[onRequestError] ${request.method} ${request.path}\n` +
      `message: ${e.message}\n` +
      `stack:\n${e.stack ?? '(no stack)'}\n`,
  )
}
