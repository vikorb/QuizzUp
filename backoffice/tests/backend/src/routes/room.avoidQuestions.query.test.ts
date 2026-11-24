import './_helpers/registerDbMock'

import { findAvoidQuestionIds } from '@backend/routes/room/_history'
import { beforeEach, describe, expect, it } from 'vitest'

import { db, dbState, resetDb } from './_helpers/mockDb'

// La requête SQL se prouve sur PostgreSQL (`avoidQuestions.pg.test.ts`) : ici, seulement le cas où
// elle ne doit pas partir.
beforeEach(() => resetDb())

const player = (overrides: Record<string, unknown>) => ({
  id: dbState.game_participants.length + 1,
  game_id: 5,
  podium: dbState.game_participants.length + 1,
  display_name: 'Joueur',
  ...overrides,
})

describe('findAvoidQuestionIds : partie sans e-mail connu', () => {
  it.each([
    ['sans e-mail', [player({ email: null, second_email: null })]],
    ['avec des e-mails vides', [player({ email: '', second_email: '  ' })]],
    ['sans participant', []],
  ])('ne lance aucune requête sur l’historique %s', async (_label, participants) => {
    dbState.game_participants.push(...participants)

    expect(await findAvoidQuestionIds(1, 5)).toEqual([])
    expect(db.raw).not.toHaveBeenCalled()
  })

  it('ne regarde que les participants de la partie courante', async () => {
    dbState.game_participants.push(
      player({ game_id: 5, email: null }),
      player({ game_id: 6, email: 'lea@x.test' })
    )

    expect(await findAvoidQuestionIds(1, 5)).toEqual([])
    expect(db.raw).not.toHaveBeenCalled()
  })

  it.each([
    ['premier e-mail', { email: 'lea@x.test' }],
    ['second e-mail', { email: null, second_email: 'tom@x.test' }],
  ])('cherche l’historique dès que le %s est connu', async (_label, emails) => {
    dbState.game_participants.push(player(emails))
    db.raw.mockReturnValueOnce({ rows: [{ question_id: 12 }, { question_id: 7 }] })

    expect(await findAvoidQuestionIds(1, 5)).toEqual([12, 7])
    expect(db.raw).toHaveBeenCalledTimes(1)
    expect(db.raw.mock.calls[0]?.[1]).toMatchObject({ companyId: 1, gameId: 5 })
  })
})
