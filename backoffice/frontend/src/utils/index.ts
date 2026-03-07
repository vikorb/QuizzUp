export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function toNumber(value: unknown): number | null {
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

export function toString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}
