import type { GameEvent } from '@quizzup/game-engine'
import { MINI_GAMES } from '@quizzup/shared'

import { ANNOUNCEMENTS } from '@/audio/announcements'
import { type AnnouncementContext, announcementForEvent } from '@/audio/announcerBridge'
import { createAppI18n } from '@/plugins/i18n'

const PODIUMS = new Map([
  [11, 1],
  [12, 4],
  [13, 6],
])

function context(overrides: Partial<AnnouncementContext> = {}): AnnouncementContext {
  return {
    inBlindTestStage: false,
    roundsCount: 5,
    podiumOf: (participantId) => PODIUMS.get(participantId),
    variant: 0,
    ...overrides,
  }
}

function say(
  type: string,
  payload: Record<string, unknown> = {},
  overrides: Partial<AnnouncementContext> = {}
): string[] {
  return announcementForEvent({ seq: 1, type, at: 0, payload } as GameEvent, context(overrides))
}

describe('catalogue des annonces', () => {
  it('compte 48 identifiants uniques, chacun avec ses textes fr et en', () => {
    const ids = ANNOUNCEMENTS.map((announcement) => announcement.id)

    expect(ids).toHaveLength(48)
    expect(new Set(ids).size).toBe(48)
    for (const announcement of ANNOUNCEMENTS) {
      expect(announcement.fr.trim(), announcement.id).not.toBe('')
      expect(announcement.en.trim(), announcement.id).not.toBe('')
    }
  })

  it('dit le numéro de pupitre ou de manche, en toutes lettres', () => {
    const byId = new Map(ANNOUNCEMENTS.map((announcement) => [announcement.id, announcement]))

    expect(byId.get('chooser.desk.3')).toMatchObject({
      fr: 'Pupitre trois, à toi de choisir le thème.',
      en: 'Desk three, pick the theme.',
    })
    expect(byId.get('game.winner.desk.6')).toMatchObject({
      fr: 'Victoire du pupitre six.',
      en: 'Desk six wins.',
    })
    expect(byId.get('round.10')).toMatchObject({ fr: 'Manche dix.', en: 'Round ten.' })
  })

  it.each(['fr', 'en'] as const)(
    '%s : chaque mini-jeu a son annonce, au nom affiché par l’écran de salle',
    (locale) => {
      const { global } = createAppI18n()

      for (const code of MINI_GAMES) {
        const announcement = ANNOUNCEMENTS.find(({ id }) => id === `minigame.${code}`)
        expect(announcement, code).toBeDefined()
        expect(announcement?.[locale], code).toBe(
          global.t(`game.miniGames.${code}.name`, {}, { locale })
        )
      }
    }
  )
})

describe('announcementForEvent', () => {
  it('ne dit que des annonces du catalogue', () => {
    const ids = new Set(ANNOUNCEMENTS.map((announcement) => announcement.id))
    const said = [
      say('game_started'),
      ...MINI_GAMES.map((miniGame) => say('round_started', { position: 3, miniGame })),
      say('round_started', { position: 5, miniGame: 'streak' }),
      say('round_chooser_selected', { participantId: 13 }),
      ...[0, 1, 2].map((variant) => say('answer_correct', {}, { variant })),
      ...[0, 1].map((variant) => say('answer_wrong', {}, { variant })),
      say('question_ended', { winnerIds: [] }),
      say('round_ended'),
      say('points_stolen'),
      say('player_eliminated'),
      say('bets_closed'),
      say('game_ended', { winnerIds: [12] }),
      say('game_ended', { winnerIds: [11, 12] }),
    ].flat()

    expect(said.length).toBeGreaterThan(20)
    for (const id of said) {
      expect(ids.has(id), id).toBe(true)
    }
  })

  it('début de partie', () => {
    expect(say('game_started')).toEqual(['game.start'])
  })

  it('début de manche : numéro puis mini-jeu', () => {
    expect(say('round_started', { position: 1, miniGame: 'quick_answer' })).toEqual([
      'round.1',
      'minigame.quick_answer',
    ])
    expect(say('round_started', { position: 4, miniGame: 'streak' })).toEqual([
      'round.4',
      'minigame.streak',
    ])
  })

  it('dernière manche : « Dernière manche » remplace le numéro', () => {
    expect(say('round_started', { position: 5, miniGame: 'estimate' })).toEqual([
      'round.last',
      'minigame.estimate',
    ])
    expect(
      say('round_started', { position: 15, miniGame: 'estimate' }, { roundsCount: 15 })
    ).toEqual(['round.last', 'minigame.estimate'])
  })

  it('partie d’une seule manche : pas de « dernière manche »', () => {
    expect(say('round_started', { position: 1, miniGame: 'estimate' }, { roundsCount: 1 })).toEqual(
      ['round.1', 'minigame.estimate']
    )
  })

  it('manche au-delà de la dixième, pas la dernière : le mini-jeu seul', () => {
    expect(say('round_started', { position: 12, miniGame: 'streak' }, { roundsCount: 20 })).toEqual(
      ['minigame.streak']
    )
  })

  it('mini-jeu inconnu : le numéro de manche seul', () => {
    expect(say('round_started', { position: 2, miniGame: 'inconnu' })).toEqual(['round.2'])
  })

  it('choix du thème : le numéro de pupitre, jamais le prénom', () => {
    expect(say('round_chooser_selected', { participantId: 12 })).toEqual(['chooser.desk.4'])
    expect(say('round_chooser_selected', { participantId: 99 })).toEqual([])
    expect(say('round_chooser_selected', { participantId: null })).toEqual([])
  })

  it('bonne réponse : les trois variantes tournent', () => {
    expect([0, 1, 2, 3].map((variant) => say('answer_correct', {}, { variant }))).toEqual([
      ['answer.correct.1'],
      ['answer.correct.2'],
      ['answer.correct.3'],
      ['answer.correct.1'],
    ])
  })

  it('mauvaise réponse : les deux variantes tournent', () => {
    expect([0, 1, 2].map((variant) => say('answer_wrong', {}, { variant }))).toEqual([
      ['answer.wrong.1'],
      ['answer.wrong.2'],
      ['answer.wrong.1'],
    ])
  })

  it('question sans gagnant : « Personne n’a trouvé », sauf question passée par le personnel', () => {
    expect(say('question_ended', { winnerIds: [] })).toEqual(['question.lost'])
    expect(say('question_ended', { winnerIds: [11] })).toEqual([])
    expect(say('question_ended', { winnerIds: [], skipped: true })).toEqual([])
  })

  it('événements propres à un mini-jeu et fin de manche', () => {
    expect(say('bets_closed')).toEqual(['bets.closed'])
    expect(say('points_stolen')).toEqual(['points.stolen'])
    expect(say('player_eliminated')).toEqual(['player.eliminated'])
    expect(say('round_ended')).toEqual(['round.end'])
  })

  it('fin de partie : pupitre vainqueur, ou égalité', () => {
    expect(say('game_ended', { winnerIds: [13] })).toEqual(['game.winner.desk.6'])
    expect(say('game_ended', { winnerIds: [11, 13] })).toEqual(['game.tie'])
    expect(say('game_ended', { winnerIds: [] })).toEqual([])
    expect(say('game_ended', { winnerIds: [99] })).toEqual([])
  })

  it('événements sans annonce', () => {
    for (const type of [
      'buzzer_pressed',
      'question_started',
      'blind_test_stage_started',
      'blind_test_paused',
      'points_awarded',
      'game_aborted',
    ]) {
      expect(say(type), type).toEqual([])
    }
  })

  it('aucune annonce pendant un palier de blind test', () => {
    const events: [string, Record<string, unknown>][] = [
      ['answer_correct', {}],
      ['answer_wrong', {}],
      ['question_ended', { winnerIds: [] }],
      ['round_ended', {}],
      ['game_ended', { winnerIds: [11] }],
    ]

    for (const [type, payload] of events) {
      expect(say(type, payload, { inBlindTestStage: true }), type).toEqual([])
      expect(say(type, payload, { inBlindTestStage: false }), type).not.toEqual([])
    }
  })
})
