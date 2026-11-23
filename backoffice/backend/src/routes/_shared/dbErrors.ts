const UNIQUE_VIOLATION = '23505'
const EXCLUSION_VIOLATION = '23P01'

/** Violation d'un index unique PostgreSQL (ex. deux créations simultanées). */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === UNIQUE_VIOLATION
}

/**
 * Violation d'une contrainte d'exclusion PostgreSQL : deux sessions qui se chevauchent dans la
 * même salle (`games_room_schedule_no_overlap`). Code distinct de `23505`.
 */
export function isExclusionViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === EXCLUSION_VIOLATION
}
