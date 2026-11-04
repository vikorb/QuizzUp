import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PLAYER_EMAIL_RETENTION_YEARS } from '@quizzup/shared'
import {
  getPlayerEmailRetentionCutoff,
  normalizePlayerEmail,
  purgeExpiredPlayerEmails,
  resolveGameTimestamp,
  selectExpiredOccurrences,
  type EmailOccurrence,
} from '@backend/jobs/purgePlayerEmails'
import { db, dbState, resetDb } from '../routes/_helpers/mockDb'

const NOW = new Date('2026-11-04T12:00:00.000Z')
// Limite = NOW - 3 ans = 2023-11-04T12:00:00.000Z
const OLD = '2023-06-01T10:00:00.000Z'
const OLD_2 = '2022-01-15T10:00:00.000Z'
const RECENT = '2026-02-01T10:00:00.000Z'
const JUST_BEFORE_CUTOFF = '2023-11-04T11:59:59.999Z'
const JUST_AFTER_CUTOFF = '2023-11-04T12:00:00.001Z'

describe('PLAYER_EMAIL_RETENTION_YEARS', () => {
  it('vaut 3 ans (décision produit)', () => {
    expect(PLAYER_EMAIL_RETENTION_YEARS).toBe(3)
  })
})

describe('normalizePlayerEmail', () => {
  it('ignore la casse et les espaces autour', () => {
    expect(normalizePlayerEmail('  Jean.Dupont@Example.COM ')).toBe('jean.dupont@example.com')
  })
})

describe('getPlayerEmailRetentionCutoff', () => {
  it('recule de 3 ans par défaut, à la milliseconde près', () => {
    expect(getPlayerEmailRetentionCutoff(NOW).toISOString()).toBe('2023-11-04T12:00:00.000Z')
  })

  it('accepte une autre durée', () => {
    expect(getPlayerEmailRetentionCutoff(NOW, 1).toISOString()).toBe('2025-11-04T12:00:00.000Z')
  })

  it('ne modifie pas la date reçue', () => {
    const now = new Date(NOW)
    getPlayerEmailRetentionCutoff(now)

    expect(now.toISOString()).toBe(NOW.toISOString())
  })
})

describe('resolveGameTimestamp', () => {
  const finishedAt = '2026-03-03T00:00:00.000Z'
  const startedAt = '2026-03-02T00:00:00.000Z'
  const gameCreatedAt = '2026-03-01T00:00:00.000Z'

  it('prend finished_at en priorité', () => {
    expect(resolveGameTimestamp({ finishedAt, startedAt, gameCreatedAt })).toBe(
      new Date(finishedAt).getTime()
    )
  })

  it('retombe sur started_at sans finished_at', () => {
    expect(resolveGameTimestamp({ finishedAt: null, startedAt, gameCreatedAt })).toBe(
      new Date(startedAt).getTime()
    )
  })

  it('retombe sur la date de création sans finished_at ni started_at', () => {
    expect(resolveGameTimestamp({ finishedAt: null, startedAt: undefined, gameCreatedAt })).toBe(
      new Date(gameCreatedAt).getTime()
    )
  })

  it('accepte des objets Date (valeurs renvoyées par pg)', () => {
    expect(
      resolveGameTimestamp({ finishedAt: new Date(finishedAt), startedAt: null, gameCreatedAt })
    ).toBe(new Date(finishedAt).getTime())
  })

  it('renvoie null sans aucune date exploitable', () => {
    expect(
      resolveGameTimestamp({ finishedAt: null, startedAt: null, gameCreatedAt: 'pas une date' })
    ).toBeNull()
  })
})

describe('selectExpiredOccurrences', () => {
  const cutoff = getPlayerEmailRetentionCutoff(NOW)

  function occurrence(overrides: Partial<EmailOccurrence>): EmailOccurrence {
    return {
      participantId: 1,
      slot: 'first',
      email: 'a@example.com',
      finishedAt: null,
      startedAt: null,
      gameCreatedAt: OLD,
      ...overrides,
    }
  }

  it('renvoie une liste vide sans occurrence', () => {
    expect(selectExpiredOccurrences([], cutoff)).toEqual([])
  })

  it('sélectionne un email dont la seule partie est ancienne', () => {
    const old = occurrence({ finishedAt: OLD })

    expect(selectExpiredOccurrences([old], cutoff)).toEqual([old])
  })

  it('garde un email récent', () => {
    expect(selectExpiredOccurrences([occurrence({ finishedAt: RECENT })], cutoff)).toEqual([])
  })

  it('garde tout un email ancien dès qu’une occurrence est récente', () => {
    const occurrences = [
      occurrence({ participantId: 1, finishedAt: OLD }),
      occurrence({ participantId: 2, slot: 'second', finishedAt: RECENT }),
    ]

    expect(selectExpiredOccurrences(occurrences, cutoff)).toEqual([])
  })

  it('efface toutes les occurrences d’un email dont la dernière partie est ancienne', () => {
    const occurrences = [
      occurrence({ participantId: 1, finishedAt: OLD }),
      occurrence({ participantId: 2, slot: 'second', finishedAt: OLD_2 }),
    ]

    expect(selectExpiredOccurrences(occurrences, cutoff)).toEqual(occurrences)
  })

  it('compare les emails sans tenir compte de la casse ni des espaces', () => {
    const occurrences = [
      occurrence({ participantId: 1, email: 'Jean@Example.com', finishedAt: OLD }),
      occurrence({ participantId: 2, email: '  jean@example.com ', finishedAt: RECENT }),
    ]

    expect(selectExpiredOccurrences(occurrences, cutoff)).toEqual([])
  })

  it('traite chaque email séparément', () => {
    const oldOne = occurrence({ participantId: 1, email: 'old@example.com', finishedAt: OLD })
    const recentOne = occurrence({
      participantId: 2,
      email: 'recent@example.com',
      finishedAt: RECENT,
    })

    expect(selectExpiredOccurrences([oldOne, recentOne], cutoff)).toEqual([oldOne])
  })

  it('applique une limite stricte (antérieure à la date limite)', () => {
    const before = occurrence({
      participantId: 1,
      email: 'b@example.com',
      finishedAt: JUST_BEFORE_CUTOFF,
    })
    const at = occurrence({ participantId: 2, email: 'c@example.com', finishedAt: cutoff })
    const after = occurrence({
      participantId: 3,
      email: 'd@example.com',
      finishedAt: JUST_AFTER_CUTOFF,
    })

    expect(selectExpiredOccurrences([before, at, after], cutoff)).toEqual([before])
  })

  it('utilise started_at puis la date de création quand finished_at manque', () => {
    const startedRecent = occurrence({
      participantId: 1,
      email: 'started@example.com',
      startedAt: RECENT,
      gameCreatedAt: OLD,
    })
    const createdRecent = occurrence({
      participantId: 2,
      email: 'created@example.com',
      gameCreatedAt: RECENT,
    })
    const createdOld = occurrence({
      participantId: 3,
      email: 'oldcreated@example.com',
      gameCreatedAt: OLD,
    })

    expect(selectExpiredOccurrences([startedRecent, createdRecent, createdOld], cutoff)).toEqual([
      createdOld,
    ])
  })

  it('garde un email dont une date est illisible (dans le doute, on ne l’efface pas)', () => {
    const occurrences = [
      occurrence({ participantId: 1, finishedAt: OLD }),
      occurrence({ participantId: 2, finishedAt: null, startedAt: null, gameCreatedAt: 'n/a' }),
    ]

    expect(selectExpiredOccurrences(occurrences, cutoff)).toEqual([])
  })
})

describe('purgeExpiredPlayerEmails', () => {
  const knexDb = db as unknown as Parameters<typeof purgeExpiredPlayerEmails>[0]

  type GameSeed = {
    id: number
    finished_at?: string | null
    started_at?: string | null
    created_at?: string
  }
  type ParticipantSeed = {
    id: number
    game_id: number
    display_name?: string
    email?: string | null
    consent_at?: string | null
    second_display_name?: string | null
    second_email?: string | null
    second_consent_at?: string | null
    score?: number
  }

  function seedGame({ id, finished_at = null, started_at = null, created_at = OLD }: GameSeed) {
    dbState.games.push({ id, finished_at, started_at, created_at, status: 1, state: 'finished' })
  }

  function seedParticipant({
    id,
    game_id,
    display_name = `Joueur ${id}`,
    email = null,
    consent_at = email ? OLD : null,
    second_display_name = null,
    second_email = null,
    second_consent_at = second_email ? OLD : null,
    score = 100,
  }: ParticipantSeed) {
    dbState.game_participants.push({
      id,
      game_id,
      podium: 1,
      display_name,
      email,
      consent_at,
      second_display_name: second_email ? (second_display_name ?? 'Second') : second_display_name,
      second_email,
      second_consent_at,
      score,
      created_at: OLD,
      updated_at: null,
    })
  }

  function participant(id: number) {
    const row = dbState.game_participants.find((item) => item.id === id)

    if (!row) {
      throw new Error(`participant ${id} introuvable`)
    }

    return row
  }

  beforeEach(() => {
    resetDb()
  })

  it('ne fait rien sans participant', async () => {
    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(0)
  })

  it('efface l’email et le consentement d’un joueur dont la dernière partie est ancienne', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedParticipant({ id: 1, game_id: 1, email: 'old@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(1)

    expect(participant(1)).toMatchObject({ email: null, consent_at: null })
  })

  it('conserve noms et scores', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedParticipant({
      id: 1,
      game_id: 1,
      display_name: 'Camille',
      email: 'old@example.com',
      second_display_name: 'Alex',
      second_email: 'alex@example.com',
      score: 250,
    })

    await purgeExpiredPlayerEmails(knexDb, NOW)

    expect(participant(1)).toMatchObject({
      display_name: 'Camille',
      second_display_name: 'Alex',
      score: 250,
      podium: 1,
      game_id: 1,
    })
  })

  it('garde l’email d’un joueur récent', async () => {
    seedGame({ id: 1, finished_at: RECENT })
    seedParticipant({ id: 1, game_id: 1, email: 'recent@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(0)

    expect(participant(1)).toMatchObject({ email: 'recent@example.com', consent_at: OLD })
  })

  it('garde partout un email présent dans une vieille partie ET une partie récente', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedGame({ id: 2, finished_at: RECENT })
    seedParticipant({ id: 1, game_id: 1, email: 'regular@example.com' })
    seedParticipant({ id: 2, game_id: 2, email: 'regular@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(0)

    expect(participant(1).email).toBe('regular@example.com')
    expect(participant(2).email).toBe('regular@example.com')
  })

  it('efface partout un email dont toutes les parties sont anciennes', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedGame({ id: 2, finished_at: OLD_2 })
    seedParticipant({ id: 1, game_id: 1, email: 'gone@example.com' })
    seedParticipant({ id: 2, game_id: 2, email: 'gone@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(2)

    expect(participant(1)).toMatchObject({ email: null, consent_at: null })
    expect(participant(2)).toMatchObject({ email: null, consent_at: null })
  })

  it('efface le 2e joueur sans toucher au 1er joueur récent', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedGame({ id: 2, finished_at: RECENT })
    seedParticipant({
      id: 1,
      game_id: 1,
      email: 'first@example.com',
      second_email: 'old2@example.com',
    })
    seedParticipant({ id: 2, game_id: 2, email: 'first@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(1)

    expect(participant(1)).toMatchObject({
      email: 'first@example.com',
      consent_at: OLD,
      second_email: null,
      second_consent_at: null,
    })
  })

  it('compte une ligne dont les deux joueurs sont purgés une seule fois', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedParticipant({ id: 1, game_id: 1, email: 'a@example.com', second_email: 'b@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(1)

    expect(participant(1)).toMatchObject({
      email: null,
      consent_at: null,
      second_email: null,
      second_consent_at: null,
    })
  })

  it('prend en compte la participation en 2e joueur pour garder un email du 1er joueur', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedGame({ id: 2, finished_at: RECENT })
    seedParticipant({ id: 1, game_id: 1, email: 'dual@example.com' })
    seedParticipant({ id: 2, game_id: 2, second_email: 'dual@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(0)

    expect(participant(1).email).toBe('dual@example.com')
    expect(participant(2).second_email).toBe('dual@example.com')
  })

  it('prend en compte la participation en 1er joueur pour garder un email du 2e joueur', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedGame({ id: 2, finished_at: RECENT })
    seedParticipant({ id: 1, game_id: 1, second_email: 'dual@example.com' })
    seedParticipant({ id: 2, game_id: 2, email: 'dual@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(0)

    expect(participant(1).second_email).toBe('dual@example.com')
  })

  it('compare les emails sans tenir compte de la casse ni des espaces', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedGame({ id: 2, finished_at: RECENT })
    seedParticipant({ id: 1, game_id: 1, email: 'Casse@Example.com' })
    seedParticipant({ id: 2, game_id: 2, email: ' casse@example.com ' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(0)

    expect(participant(1).email).toBe('Casse@Example.com')
  })

  it('efface toutes les variantes de casse d’un email ancien', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedGame({ id: 2, finished_at: OLD_2 })
    seedParticipant({ id: 1, game_id: 1, email: 'Casse@Example.com' })
    seedParticipant({ id: 2, game_id: 2, email: 'casse@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(2)

    expect(participant(1).email).toBeNull()
    expect(participant(2).email).toBeNull()
  })

  it('utilise started_at quand la partie n’est pas terminée', async () => {
    seedGame({ id: 1, finished_at: null, started_at: RECENT, created_at: OLD })
    seedParticipant({ id: 1, game_id: 1, email: 'started@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(0)

    expect(participant(1).email).toBe('started@example.com')
  })

  it('utilise la date de création quand la partie n’a ni début ni fin', async () => {
    seedGame({ id: 1, created_at: RECENT })
    seedGame({ id: 2, created_at: OLD })
    seedParticipant({ id: 1, game_id: 1, email: 'recent-created@example.com' })
    seedParticipant({ id: 2, game_id: 2, email: 'old-created@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(1)

    expect(participant(1).email).toBe('recent-created@example.com')
    expect(participant(2).email).toBeNull()
  })

  it('préfère finished_at à started_at (une vieille date de début ne périme pas une partie récente)', async () => {
    seedGame({ id: 1, finished_at: RECENT, started_at: OLD })
    seedParticipant({ id: 1, game_id: 1, email: 'long@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(0)
  })

  it('compte les parties supprimées logiquement : un joueur récent garde son email', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedGame({ id: 2, finished_at: RECENT })
    dbState.games[1].status = 2
    dbState.games[1].deleted_at = RECENT
    seedParticipant({ id: 1, game_id: 1, email: 'deleted-game@example.com' })
    seedParticipant({ id: 2, game_id: 2, email: 'deleted-game@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(0)
  })

  it('ignore les participants sans email', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedParticipant({ id: 1, game_id: 1 })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(0)

    expect(participant(1).updated_at).toBeNull()
  })

  it('est idempotente : une 2e exécution ne modifie plus rien', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedParticipant({ id: 1, game_id: 1, email: 'old@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(1)
    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(0)
  })

  it('utilise la date courante par défaut', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedGame({ id: 2, finished_at: new Date().toISOString() })
    seedParticipant({ id: 1, game_id: 1, email: 'old@example.com' })
    seedParticipant({ id: 2, game_id: 2, email: 'today@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb)).resolves.toBe(1)

    expect(participant(2).email).toBe('today@example.com')
  })

  it('traite plusieurs joueurs d’un coup et ne touche que les périmés', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedGame({ id: 2, finished_at: RECENT })
    seedParticipant({ id: 1, game_id: 1, email: 'x@example.com', second_email: 'y@example.com' })
    seedParticipant({ id: 2, game_id: 1, email: 'z@example.com' })
    seedParticipant({ id: 3, game_id: 2, email: 'z@example.com', second_email: 'w@example.com' })

    await expect(purgeExpiredPlayerEmails(knexDb, NOW)).resolves.toBe(1)

    expect(participant(1)).toMatchObject({ email: null, second_email: null })
    expect(participant(2).email).toBe('z@example.com')
    expect(participant(3)).toMatchObject({ email: 'z@example.com', second_email: 'w@example.com' })
  })

  it('exécute la purge dans une transaction', async () => {
    seedGame({ id: 1, finished_at: OLD })
    seedParticipant({ id: 1, game_id: 1, email: 'old@example.com' })
    const transaction = vi.spyOn(db, 'transaction')

    await purgeExpiredPlayerEmails(knexDb, NOW)

    expect(transaction).toHaveBeenCalledTimes(1)
    transaction.mockRestore()
  })
})
