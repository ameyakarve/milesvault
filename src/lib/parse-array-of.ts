export type ItemValidator<T> = (
  raw: Record<string, unknown>,
  index: number,
) => { errors: string[]; value?: T }

export function parseArrayOf<T>(
  label: string,
  raw: unknown,
  validate: ItemValidator<T>,
): { values: T[]; errors: string[] } {
  const values: T[] = []
  const errors: string[] = []
  if (raw === undefined) return { values, errors }
  if (!Array.isArray(raw)) {
    errors.push(`${label} must be an array.`)
    return { values, errors }
  }
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown> | null
    if (!item || typeof item !== 'object') {
      errors.push(`${label}[${i}] must be an object.`)
      continue
    }
    const r = validate(item, i)
    if (r.errors.length > 0) errors.push(...r.errors)
    if (r.value !== undefined) values.push(r.value)
  }
  return { values, errors }
}
