const UNIQUE_VIOLATION = '23505'

/** Violation d'un index unique PostgreSQL (ex. deux créations simultanées). */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === UNIQUE_VIOLATION
}
