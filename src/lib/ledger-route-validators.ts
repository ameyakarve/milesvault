import { MAX_RAW_TEXT_BYTES } from '@/lib/ledger-api'
import type {
  BatchCreate,
  BatchDelete,
  BatchUpdate,
  KnownId,
} from '@/durable/ledger-types'
import type { ItemValidator } from '@/lib/parse-array-of'

const enc = new TextEncoder()

export const validateBatchUpdate: ItemValidator<BatchUpdate> = (item, i) => {
  const errors: string[] = []
  if (!Number.isInteger(item.id) || (item.id as number) <= 0) {
    errors.push(`updates[${i}].id must be a positive integer.`)
  }
  if (typeof item.raw_text !== 'string') {
    errors.push(`updates[${i}].raw_text must be a string.`)
  } else if (enc.encode(item.raw_text).byteLength > MAX_RAW_TEXT_BYTES) {
    errors.push(`updates[${i}].raw_text exceeds ${MAX_RAW_TEXT_BYTES} bytes.`)
  }
  if (!Number.isInteger(item.expected_updated_at)) {
    errors.push(`updates[${i}].expected_updated_at must be an integer.`)
  }
  if (
    typeof item.id === 'number' &&
    typeof item.raw_text === 'string' &&
    typeof item.expected_updated_at === 'number'
  ) {
    return {
      errors,
      value: {
        id: item.id,
        raw_text: item.raw_text,
        expected_updated_at: item.expected_updated_at,
      },
    }
  }
  return { errors }
}

export const validateBatchCreate: ItemValidator<BatchCreate> = (item, i) => {
  if (typeof item.raw_text !== 'string') {
    return { errors: [`creates[${i}].raw_text must be a string.`] }
  }
  if (enc.encode(item.raw_text).byteLength > MAX_RAW_TEXT_BYTES) {
    return { errors: [`creates[${i}].raw_text exceeds ${MAX_RAW_TEXT_BYTES} bytes.`] }
  }
  return { errors: [], value: { raw_text: item.raw_text } }
}

export const validateBatchDelete: ItemValidator<BatchDelete> = (item, i) => {
  const errors: string[] = []
  if (!Number.isInteger(item.id) || (item.id as number) <= 0) {
    errors.push(`deletes[${i}].id must be a positive integer.`)
  }
  if (!Number.isInteger(item.expected_updated_at)) {
    errors.push(`deletes[${i}].expected_updated_at must be an integer.`)
  }
  if (typeof item.id === 'number' && typeof item.expected_updated_at === 'number') {
    return {
      errors,
      value: { id: item.id, expected_updated_at: item.expected_updated_at },
    }
  }
  return { errors }
}

export const validateKnownId: ItemValidator<KnownId> = (item, i) => {
  const errors: string[] = []
  if (!Number.isInteger(item.id) || (item.id as number) <= 0) {
    errors.push(`knownIds[${i}].id must be a positive integer.`)
  }
  if (!Number.isInteger(item.expected_updated_at)) {
    errors.push(`knownIds[${i}].expected_updated_at must be an integer.`)
  }
  if (typeof item.id === 'number' && typeof item.expected_updated_at === 'number') {
    return {
      errors,
      value: { id: item.id, expected_updated_at: item.expected_updated_at },
    }
  }
  return { errors }
}
