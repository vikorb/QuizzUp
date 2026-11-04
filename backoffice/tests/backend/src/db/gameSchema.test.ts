import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_ROLE,
  ADMIN_ROLE_ROOM,
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_MAX_QUESTIONS_PER_ROUND,
  GAME_MAX_ROUNDS,
  GAME_PODIUMS,
  GAME_STATE_PENDING,
  GAME_STATES,
  GAME_STATUSES,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAMES,
  ROOM_STATUSES,
  ROUND_CHOOSER_REASONS,
} from '@quizzup/shared'

/**
 * Garde-fou : les contraintes CHECK des migrations et les constantes de
 * `@quizzup/shared` doivent rester alignées (une valeur ajoutée d'un côté
 * sans l'autre casserait l'API à l'exécution, sans erreur de compilation).
 */
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'backend/db/migrations')

function readMigration(fileName: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, fileName), 'utf8')
}

/** Valeurs listées dans `CHECK (<column> IN (...))` d'une migration. */
function getCheckValues(source: string, column: string): string[] {
  const match = new RegExp(String.raw`${column} IN \(([^)]*)\)`).exec(source)

  if (!match) {
    throw new Error(`Contrainte CHECK introuvable pour ${column}`)
  }

  return match[1].split(',').map((value) => value.trim().replaceAll("'", ''))
}

const roomsMigration = readMigration('20261103220000_create_rooms_table.js')
const roomRoleMigration = readMigration('20261103220100_add_room_role_to_admins.js')
const gamesMigration = readMigration('20261103220200_create_games_tables.js')
const miniGamesMigration = readMigration('20261104010000_add_mini_games_to_game_rounds.js')
const podiumsMigration = readMigration('20261104040000_raise_game_podiums_to_six.js')

describe('game schema migrations', () => {
  it('aligns room statuses with shared constants', () => {
    expect(getCheckValues(roomsMigration, 'status').map(Number)).toEqual([...ROOM_STATUSES])
  })

  it('allows every admin role plus the room role', () => {
    const upSource = roomRoleMigration.slice(0, roomRoleMigration.indexOf('exports.down'))

    expect(getCheckValues(upSource, 'role')).toEqual([
      ADMIN_ROLE.SUPERADMIN,
      ADMIN_ROLE.ADMIN,
      ADMIN_ROLE.USER,
      ADMIN_ROLE_ROOM,
    ])
  })

  it('aligns game statuses and states with shared constants', () => {
    expect(getCheckValues(gamesMigration, 'status').map(Number)).toEqual([...GAME_STATUSES])
    expect(getCheckValues(gamesMigration, 'state')).toEqual([...GAME_STATES])
    expect(gamesMigration).toContain(`defaultTo('${GAME_STATE_PENDING}')`)
  })

  it('aligns mini games and chooser reasons with shared constants', () => {
    // Le CHECK d'origine ne connaissait que le blind test ; la migration des
    // nouveaux mini-jeux l'élargit à tout le catalogue partagé.
    expect(getCheckValues(gamesMigration, 'mini_game')).toEqual([MINI_GAME_FLASH_BLIND_TEST])
    const listed = /const MINI_GAMES = \[([^\]]*)\]/.exec(miniGamesMigration)?.[1] ?? ''
    expect(
      listed
        .split(',')
        .map((value) => value.trim().replaceAll("'", ''))
        .filter(Boolean)
    ).toEqual([...MINI_GAMES])
    expect(getCheckValues(gamesMigration, 'chooser_reason')).toEqual([...ROUND_CHOOSER_REASONS])
  })

  it('uses the shared game format defaults', () => {
    expect(gamesMigration).toContain(
      `table.smallint('rounds_count').notNullable().defaultTo(${GAME_DEFAULT_ROUNDS})`
    )
    expect(gamesMigration).toContain(
      `table.smallint('questions_per_round').notNullable().defaultTo(${GAME_DEFAULT_QUESTIONS_PER_ROUND})`
    )
    expect(gamesMigration).toContain(`rounds_count BETWEEN 1 AND ${GAME_MAX_ROUNDS}`)
    expect(gamesMigration).toContain(
      `questions_per_round BETWEEN 1 AND ${GAME_MAX_QUESTIONS_PER_ROUND}`
    )
    // Le CHECK d'origine plafonnait à 4 pupitres ; la migration « six pupitres » l'élargit.
    expect(gamesMigration).toContain('podium BETWEEN 1 AND 4')
  })

  it('aligns the podium ceiling with GAME_PODIUMS and keeps a safe rollback', () => {
    const split = podiumsMigration.indexOf('exports.down')
    const upSource = podiumsMigration.slice(0, split)
    const downSource = podiumsMigration.slice(split)

    expect(podiumsMigration).toContain(`const MAX_PODIUM = ${GAME_PODIUMS}`)
    expect(upSource).toContain('podium BETWEEN 1 AND ${MAX_PODIUM}')
    // Retour à 4 refusé tant qu'un participant occupe un pupitre 5 ou 6.
    expect(downSource).toContain("where('podium', '>', PREVIOUS_MAX_PODIUM)")
    expect(downSource).toContain('Rollback impossible')
    expect(downSource).toContain('podium BETWEEN 1 AND ${PREVIOUS_MAX_PODIUM}')
  })
})
