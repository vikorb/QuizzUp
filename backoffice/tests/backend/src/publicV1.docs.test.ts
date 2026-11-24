import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  API_IDEMPOTENCY_TTL_HOURS,
  API_KEY_MAX_ACTIVE,
  API_LOG_RETENTION_DAYS,
  GAME_EXTERNAL_REF_MAX_LENGTH,
  GAME_LOCALES,
  GAME_MAX_PLAYERS,
  GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH,
  GAME_PODIUMS,
  GAME_STATES,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

// Le contrat de `/public/v1` est un fichier à part (`public-v1.yaml`) : ses listes de valeurs et
// ses bornes restent alignées sur `@quizzup/shared`, comme celles d'`openapi.yaml`.
const readDoc = (file: string) =>
  readFileSync(path.resolve(process.cwd(), 'docs/api', file), 'utf8').replace(/\r\n/g, '\n')

const contract = readDoc('public-v1.yaml')
const openapi = readDoc('openapi.yaml')

const enumsOf = (source: string) =>
  [...source.matchAll(/enum: \[([^\]]*)\]/g)].map((match) =>
    match[1].split(',').map((value) => value.trim())
  )

describe('docs/api/public-v1.yaml', () => {
  it('documents every route of the booking API, and the unauthenticated spec route', () => {
    for (const route of [
      '/public/v1/rooms:',
      '/public/v1/availability:',
      '/public/v1/bookings:',
      '/public/v1/bookings/{id}:',
      '/public/v1/openapi.yaml:',
    ]) {
      expect(contract).toContain(`  ${route}\n`)
    }
    // Seule la route du contrat se passe de clé.
    expect(contract.match(/security: \[\]/g)).toHaveLength(1)
  })

  it('lists the game states and locales of the shared constants', () => {
    const enums = enumsOf(contract)

    expect(enums).toContainEqual([...GAME_STATES])
    expect(enums).toContainEqual([...GAME_LOCALES])
  })

  it('keeps the shared limits (players, desks, name and reference lengths)', () => {
    expect(contract).toContain(`maximum: ${GAME_MAX_PLAYERS}`)
    expect(contract).toContain(`maxItems: ${GAME_PODIUMS}`)
    expect(contract).toContain(`maxLength: ${GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH}`)
    expect(contract).toContain(`maxLength: ${GAME_EXTERNAL_REF_MAX_LENGTH}`)
    expect(contract).toContain(`${API_IDEMPOTENCY_TTL_HOURS} heures`)
  })

  it('names the error codes of the booking API', () => {
    for (const code of [
      'api_key_missing',
      'api_key_invalid',
      'company_inactive',
      'too_many_requests',
      'payload_too_large',
      'invalid_query',
      'room_not_found',
      'date_out_of_range',
      'idempotency_key_required',
      'idempotency_key_reused',
      'slot_unavailable',
      'slot_taken',
      'too_many_players',
      'booking_not_found',
      'booking_not_modifiable',
      'booking_not_cancellable',
    ]) {
      expect(contract).toContain(`\`${code}\``)
    }
  })
})

describe('docs/api/openapi.yaml — clés d’API (lot 14)', () => {
  it('documents the keys and log routes of the backoffice', () => {
    for (const route of [
      '/companies/{companyId}/api-keys:',
      '/companies/{companyId}/api-keys/{apiKeyId}:',
      '/companies/{companyId}/api-logs:',
    ]) {
      expect(openapi).toContain(`  ${route}\n`)
    }
  })

  it('keeps the retention and key limits of the shared constants', () => {
    expect(openapi).toContain(`conservés ${API_LOG_RETENTION_DAYS} jours`)
    expect(openapi).toContain(`Au plus ${API_KEY_MAX_ACTIVE} clés actives`)
  })
})
