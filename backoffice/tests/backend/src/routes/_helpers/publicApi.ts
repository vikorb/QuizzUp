import fastify from 'fastify'

import { API_KEY_STATUS_REVOKED, ROOM_STATUS_ACTIVE, type RoomSchedule } from '@quizzup/shared'
import { PUBLIC_API_PREFIX } from '@backend/routes/public/_shared'
import { generateApiKey } from '@backend/security/apiKeys'
import { seedApiKey } from './apiKeys'
import { dbState } from './mockDb'

/** Instant figé des tests de l'API de réservation : jeudi 10 mars 2027, 09:00 à Paris (heure d'hiver). */
export const PUBLIC_API_NOW = new Date('2027-03-10T08:00:00.000Z')

/** Ouverte tous les jours de 10:00 à 22:00, créneaux d'une heure bout à bout, 4 pupitres ouverts. */
export const OPEN_EVERY_DAY: RoomSchedule = {
  timezone: 'Europe/Paris',
  slotMinutes: 60,
  breakMinutes: 0,
  bookableDesks: 4,
  publicBooking: true,
  days: Object.fromEntries(
    ['1', '2', '3', '4', '5', '6', '7'].map((day) => [day, { opensAt: '10:00', closesAt: '22:00' }])
  ),
}

/** Application réduite à l'API publique, comme `routes/index.ts` la monte. */
export async function createPublicApp() {
  // Import tardif : un test `*.pg.test.ts` règle `DATABASE_URL` avant que `db` ne soit chargé.
  const { default: publicRoutes } = await import('@backend/routes/public')
  const app = fastify({ logger: false })

  // Le projet de tests ne charge pas les augmentations de types du backend.
  await app.register(publicRoutes as never, { prefix: PUBLIC_API_PREFIX })
  await app.ready()

  return app
}

/** Clé d'API active de la compagnie ; renvoie le jeton à présenter et la ligne en base. */
export function seedToken(companyId = 1, overrides: Record<string, unknown> = {}) {
  const { token, prefix, hash } = generateApiKey()
  const row = seedApiKey({
    company_id: companyId,
    key_prefix: prefix,
    key_hash: hash,
    ...overrides,
  })

  return { token, row }
}

/** Même chose, révoquée. */
export function seedRevokedToken(companyId = 1) {
  return seedToken(companyId, {
    status: API_KEY_STATUS_REVOKED,
    deleted_at: '2027-03-01T00:00:00.000Z',
  })
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

/** Salle réservable (active, créneaux réglés) ; `overrides` change n'importe quelle colonne. */
export function seedRoom(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const row = {
    id: dbState.rooms.length + 1,
    company_id: 1,
    name: `Salle ${dbState.rooms.length + 1}`,
    status: ROOM_STATUS_ACTIVE,
    config: { desksCount: 4 },
    schedule: OPEN_EVERY_DAY,
    ...overrides,
  }

  dbState.rooms.push(row)

  return row
}
