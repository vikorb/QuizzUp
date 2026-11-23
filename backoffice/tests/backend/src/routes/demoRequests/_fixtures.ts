export function demoRequestRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    contact_name: 'Camille Martin',
    center_name: 'Escape Test',
    email: 'camille@example.com',
    phone: '+33 1 23 45 67 89',
    rooms_count: 3,
    message: 'Bonjour',
    locale: 'fr',
    consent_at: '2026-11-01T10:00:00.000Z',
    processed_at: null,
    processed_by: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    ...overrides,
  }
}
