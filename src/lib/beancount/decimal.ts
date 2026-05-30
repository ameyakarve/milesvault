// Fixed-point decimal helpers for Beancount amounts. We do all arithmetic on
// (scaled, scale) integer pairs to avoid Number's binary-fraction rounding —
// 0.1 + 0.2 must equal exactly 0.3 when checking that a transaction balances.

export type Scaled = { scaled: number; scale: number }

// Parse "1234.56" or "-100" into { scaled, scale }. Returns null on malformed
// input. Result fits in JS Number for typical financial magnitudes
// (≤ ~9e15 / 10^scale).
export function decimalToScaled(text: string): Scaled | null {
  const trimmed = text.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null
  const negative = trimmed.startsWith('-')
  const body = negative ? trimmed.slice(1) : trimmed
  const dot = body.indexOf('.')
  const intPart = dot === -1 ? body : body.slice(0, dot)
  const fracPart = dot === -1 ? '' : body.slice(dot + 1)
  const scale = fracPart.length
  const digits = intPart + fracPart
  const mag = Number(digits === '' ? '0' : digits)
  return { scaled: negative ? -mag : mag, scale }
}

export function scaledAdd(a: Scaled, b: Scaled): Scaled {
  const scale = Math.max(a.scale, b.scale)
  const aS = a.scaled * 10 ** (scale - a.scale)
  const bS = b.scaled * 10 ** (scale - b.scale)
  return { scaled: aS + bS, scale }
}

export function scaledMul(a: Scaled, b: Scaled): Scaled {
  return { scaled: a.scaled * b.scaled, scale: a.scale + b.scale }
}

export function scaledNeg(a: Scaled): Scaled {
  return { scaled: -a.scaled, scale: a.scale }
}

export function scaledIsZero(a: Scaled): boolean {
  return a.scaled === 0
}

export function scaledFormat(a: Scaled): string {
  const isNeg = a.scaled < 0
  const abs = Math.abs(a.scaled)
  if (a.scale === 0) return isNeg ? `-${abs}` : String(abs)
  const digits = String(abs).padStart(a.scale + 1, '0')
  const intPart = digits.slice(0, digits.length - a.scale)
  const fracPart = digits.slice(digits.length - a.scale)
  const out = `${intPart}.${fracPart}`
  return isNeg ? `-${out}` : out
}
