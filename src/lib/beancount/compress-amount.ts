const SCALES: ReadonlyArray<readonly [string, number]> = [
  ['B', 9],
  ['M', 6],
  ['K', 3],
]

export function compressAmount(raw: string): string | null {
  const sign = raw[0] === '-' || raw[0] === '+' ? raw[0] : ''
  const body = sign ? raw.slice(1) : raw
  const [intPart, fracPart = ''] = body.split('.')
  const cleanInt = intPart.replace(/^0+(?=\d)/, '') || '0'
  for (const [suffix, digits] of SCALES) {
    if (cleanInt.length <= digits) continue
    const head = cleanInt.slice(0, cleanInt.length - digits)
    const tail = (cleanInt.slice(cleanInt.length - digits) + fracPart).replace(/0+$/, '')
    const compressed = `${sign}${head}${tail ? `.${tail}` : ''}${suffix}`
    if (compressed.length <= raw.length) return compressed
  }
  return null
}
