import {
  createGame,
  DEFAULT_GAME_TIMINGS,
  type GameCommand,
  type GameEvent,
  type GameState,
  getMiniGameQuestion,
  reduceGame,
} from '@quizzup/game-engine'
import {
  MINI_GAME_ESTIMATE,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_PROGRESSIVE_REVEAL,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAME_STREAK,
  MINI_GAMES,
  type MiniGame,
} from '@quizzup/shared'

import {
  ANNOUNCEMENTS,
  ANSWER_CORRECT_VARIANTS,
  ANSWER_WRONG_VARIANTS,
} from '@/audio/announcements'
import {
  type AnnouncementContext,
  announcementForEvent,
  MINI_GAMES_ANSWERING_BY_EVENT,
} from '@/audio/announcerBridge'
import { createAppI18n } from '@/plugins/i18n'

import { baseSetup } from '../_helpers/fixtures'

const PODIUMS = new Map([
  [11, 1],
  [12, 4],
  [13, 6],
])

function context(overrides: Partial<AnnouncementContext> = {}): AnnouncementContext {
  return {
    miniGame: MINI_GAME_QUICK_ANSWER,
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

/** Scores d'une fin de partie où le pupitre vainqueur a marqué. */
const SCORES = [
  { participantId: 11, score: 300 },
  { participantId: 12, score: 100 },
]

/** Nombre d'identifiants du catalogue qui commencent par `prefix`. */
const count = (prefix: string) =>
  ANNOUNCEMENTS.filter((announcement) => announcement.id.startsWith(prefix)).length

describe('catalogue des annonces', () => {
  it('compte 47 identifiants uniques, chacun avec ses textes fr et en', () => {
    const ids = ANNOUNCEMENTS.map((announcement) => announcement.id)

    expect(ids).toHaveLength(47)
    expect(new Set(ids).size).toBe(47)
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

  it('ne numérote pas la première manche', () => {
    const ids = ANNOUNCEMENTS.map((announcement) => announcement.id)

    expect(ids).not.toContain('round.1')
    expect(ids).toContain('round.2')
  })

  it('un texte par variante de réponse', () => {
    expect(count('answer.correct.')).toBe(ANSWER_CORRECT_VARIANTS)
    expect(count('answer.wrong.')).toBe(ANSWER_WRONG_VARIANTS)
  })

  it('texte d’élimination neutre, sans accord', () => {
    expect(ANNOUNCEMENTS.find(({ id }) => id === 'player.eliminated')).toMatchObject({
      fr: 'Élimination.',
      en: 'Eliminated.',
    })
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
      say('round_started', { position: 5, miniGame: MINI_GAME_STREAK }),
      say('round_chooser_selected', { participantId: 13 }),
      ...[0, 1, 2].map((variant) => say('answer_correct', {}, { variant })),
      ...[0, 1].map((variant) => say('answer_wrong', {}, { variant })),
      ...[-7, -1, 2.5, 99].map((variant) => say('answer_correct', {}, { variant })),
      ...MINI_GAMES.map((miniGame) => say('question_ended', { winnerIds: [11] }, { miniGame })),
      say('question_ended', { winnerIds: [] }),
      say('round_ended'),
      say('points_stolen'),
      say('player_eliminated'),
      say('bets_closed'),
      say('game_ended', { winnerIds: [12], scores: SCORES }),
      say('game_ended', { winnerIds: [11, 12], scores: SCORES }),
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
    expect(say('round_started', { position: 2, miniGame: MINI_GAME_QUICK_ANSWER })).toEqual([
      'round.2',
      `minigame.${MINI_GAME_QUICK_ANSWER}`,
    ])
    expect(say('round_started', { position: 4, miniGame: MINI_GAME_STREAK })).toEqual([
      'round.4',
      `minigame.${MINI_GAME_STREAK}`,
    ])
  })

  it('première manche : pas de « manche un », le mini-jeu seul après « la partie commence »', () => {
    expect(say('round_started', { position: 1, miniGame: MINI_GAME_QUICK_ANSWER })).toEqual([
      `minigame.${MINI_GAME_QUICK_ANSWER}`,
    ])
  })

  it('dernière manche : « Dernière manche » remplace le numéro', () => {
    expect(say('round_started', { position: 5, miniGame: MINI_GAME_ESTIMATE })).toEqual([
      'round.last',
      `minigame.${MINI_GAME_ESTIMATE}`,
    ])
    expect(
      say('round_started', { position: 15, miniGame: MINI_GAME_ESTIMATE }, { roundsCount: 15 })
    ).toEqual(['round.last', `minigame.${MINI_GAME_ESTIMATE}`])
  })

  it('partie d’une seule manche : ni numéro, ni « dernière manche »', () => {
    expect(
      say('round_started', { position: 1, miniGame: MINI_GAME_ESTIMATE }, { roundsCount: 1 })
    ).toEqual([`minigame.${MINI_GAME_ESTIMATE}`])
  })

  it('manche au-delà de la dixième, pas la dernière : le mini-jeu seul', () => {
    expect(
      say('round_started', { position: 12, miniGame: MINI_GAME_STREAK }, { roundsCount: 20 })
    ).toEqual([`minigame.${MINI_GAME_STREAK}`])
  })

  it('mini-jeu inconnu : le numéro de manche seul', () => {
    expect(say('round_started', { position: 2, miniGame: 'inconnu' })).toEqual(['round.2'])
  })

  it.each([0, -1, 2.5, 'abc', undefined, null])(
    'manche à la position %s : aucun numéro, le mini-jeu seul',
    (position) => {
      expect(say('round_started', { position, miniGame: MINI_GAME_STREAK })).toEqual([
        `minigame.${MINI_GAME_STREAK}`,
      ])
    }
  )

  it('choix du thème : le numéro de pupitre, jamais le prénom', () => {
    expect(say('round_chooser_selected', { participantId: 12 })).toEqual(['chooser.desk.4'])
    expect(say('round_chooser_selected', { participantId: 99 })).toEqual([])
    expect(say('round_chooser_selected', { participantId: null })).toEqual([])
  })

  it.each([0, 7, 2.5, Number.NaN])('pupitre hors limites (%s) : rien à dire', (podium) => {
    const podiumOf = () => podium

    expect(say('round_chooser_selected', { participantId: 11 }, { podiumOf })).toEqual([])
    expect(say('game_ended', { winnerIds: [11], scores: SCORES }, { podiumOf })).toEqual([])
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

  it.each([
    [-1, 'answer.correct.3', 'answer.wrong.2'],
    [-3, 'answer.correct.1', 'answer.wrong.2'],
    [2.5, 'answer.correct.3', 'answer.wrong.1'],
    [Number.NaN, 'answer.correct.1', 'answer.wrong.1'],
    [Number.POSITIVE_INFINITY, 'answer.correct.1', 'answer.wrong.1'],
  ])('variante %s : rangée dans le catalogue', (variant, correct, wrong) => {
    expect(say('answer_correct', {}, { variant })).toEqual([correct])
    expect(say('answer_wrong', {}, { variant })).toEqual([wrong])
  })

  it('question sans gagnant : « Personne n’a trouvé », sauf question passée par le personnel', () => {
    expect(say('question_ended', { winnerIds: [] })).toEqual(['question.lost'])
    expect(
      say('question_ended', { winnerIds: [] }, { miniGame: MINI_GAME_FLASH_BLIND_TEST })
    ).toEqual(['question.lost'])
    expect(say('question_ended', { winnerIds: [], skipped: true })).toEqual([])
    expect(say('question_ended', { winnerIds: [11], skipped: true })).toEqual([])
  })

  it.each([undefined, null, 11, 'oui', {}])(
    'question terminée avec winnerIds = %s (pas un tableau) : rien à dire',
    (winnerIds) => {
      expect(say('question_ended', { winnerIds })).toEqual([])
    }
  )

  it('question gagnée : la bonne réponse est dite une seule fois, à l’événement qui la porte', () => {
    for (const miniGame of MINI_GAMES) {
      const byEvent = MINI_GAMES_ANSWERING_BY_EVENT.includes(miniGame)

      expect(say('question_ended', { winnerIds: [11] }, { miniGame }), miniGame).toEqual(
        byEvent ? [] : ['answer.correct.1']
      )
      expect(say('answer_correct', {}, { miniGame }), miniGame).toEqual(['answer.correct.1'])
    }
  })

  it('blind test : jamais « raté », la voix attend la fin de la question', () => {
    const blind = { miniGame: MINI_GAME_FLASH_BLIND_TEST }

    expect(say('answer_wrong', {}, blind)).toEqual([])
    expect(say('answer_correct', {}, blind)).toEqual(['answer.correct.1'])
    expect(say('question_ended', { winnerIds: [11] }, blind)).toEqual([])
    expect(say('question_ended', { winnerIds: [] }, blind)).toEqual(['question.lost'])
    for (const miniGame of [MINI_GAME_FIRST_BUZZ, MINI_GAME_PROGRESSIVE_REVEAL]) {
      expect(say('answer_wrong', {}, { miniGame }), miniGame).toEqual(['answer.wrong.1'])
    }
  })

  it('événements propres à un mini-jeu et fin de manche', () => {
    expect(say('bets_closed')).toEqual(['bets.closed'])
    expect(say('points_stolen')).toEqual(['points.stolen'])
    expect(say('player_eliminated')).toEqual(['player.eliminated'])
    expect(say('round_ended')).toEqual(['round.end'])
  })

  it('fin de partie : pupitre vainqueur, ou égalité', () => {
    const scores = [...SCORES, { participantId: 13, score: 300 }]

    expect(say('game_ended', { winnerIds: [11], scores })).toEqual(['game.winner.desk.1'])
    expect(say('game_ended', { winnerIds: [13], scores })).toEqual(['game.winner.desk.6'])
    expect(say('game_ended', { winnerIds: [11, 13], scores })).toEqual(['game.tie'])
    expect(say('game_ended', { winnerIds: [], scores })).toEqual([])
    expect(say('game_ended', { winnerIds: [99], scores })).toEqual([])
  })

  it.each([undefined, null, 11, 'oui', {}])(
    'fin de partie avec winnerIds = %s (pas un tableau) : rien à dire',
    (winnerIds) => {
      expect(say('game_ended', { winnerIds, scores: SCORES })).toEqual([])
    }
  )

  it('fin de partie sans contenu jouable, ou sans aucun point : rien à dire', () => {
    const zero = [{ participantId: 11, score: 0 }]

    expect(say('game_ended', { winnerIds: [11], scores: SCORES, reason: 'no_content' })).toEqual([])
    expect(say('game_ended', { winnerIds: [11], scores: zero, reason: 'completed' })).toEqual([])
    expect(say('game_ended', { winnerIds: [11, 12], scores: zero })).toEqual([])
    expect(say('game_ended', { winnerIds: [11] })).toEqual([])
    expect(say('game_ended', { winnerIds: [11], scores: SCORES, reason: 'completed' })).toEqual([
      'game.winner.desk.1',
    ])
  })

  it('événements sans annonce', () => {
    for (const type of [
      'buzzer_pressed',
      'question_started',
      'blind_test_stage_started',
      'blind_test_stage_resumed',
      'blind_test_paused',
      'answer_locked',
      'points_awarded',
      'game_aborted',
    ]) {
      expect(say(type), type).toEqual([])
    }
  })
})

/**
 * Vrai moteur : pas d'événement fabriqué. Chaque test pilote une partie à un seul mini-jeu
 * (Léa, Hugo et Inès, pupitres 1 à 3) et relève les annonces lot d'événements par lot (une
 * commande = un lot), en ignorant les lots muets.
 */
function createRun(miniGame: MiniGame, setupOverrides: Parameters<typeof baseSetup>[0] = {}) {
  let state: GameState = createGame(baseSetup({ miniGames: [miniGame], ...setupOverrides }))
  let at = 1000
  const events: GameEvent[] = []

  const questionOf = () =>
    state.phase.name === 'question' ? getMiniGameQuestion(state.phase.miniGameState) : null
  const apply = (command: GameCommand): string[] => {
    const step = reduceGame(state, command)
    state = step.state
    events.push(...step.events)
    const round = state.rounds.at(-1)
    return step.events.flatMap((event) =>
      announcementForEvent(event, {
        miniGame: round?.miniGame ?? miniGame,
        roundsCount: state.setup.roundsCount,
        podiumOf: (id) => state.setup.participants.find((candidate) => candidate.id === id)?.podium,
        variant: 0,
      })
    )
  }
  const run = {
    events,
    get state() {
      return state
    },
    start: () => apply({ type: 'start', at }),
    tick: (ms: number) => apply({ type: 'tick', at: (at += ms) }),
    press: (participantId: number, button: 0 | 1 | 2 | 3) => {
      const participant = state.setup.participants.find(
        (candidate) => candidate.id === participantId
      )
      return apply({ type: 'press', at: (at += 10), podium: participant?.podium ?? 0, button })
    },
    /** Index d'un bouton de la question en cours : bonne ou mauvaise réponse. */
    button: (correct: boolean) =>
      questionOf()?.answers.findIndex((answer) => answer.isCorrect === correct) as 0 | 1 | 2 | 3,
    /** Fait avancer le temps par pas de `stepMs` jusqu'à `done` ; rend les lots non muets. */
    tickUntil: (done: () => boolean, stepMs = 500) => {
      const batches: string[][] = []
      for (let guard = 0; guard < 400 && !done(); guard += 1) {
        const said = run.tick(stepMs)
        if (said.length > 0) {
          batches.push(said)
        }
      }
      return batches
    },
    /** Du lobby à la première question : le joueur désigné choisit le premier thème. */
    open: () => {
      run.start()
      run.tick(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)
      run.press(state.rounds.at(-1)?.chooserParticipantId as number, 0)
    },
    inQuestion: () => state.phase.name === 'question',
  }
  return run
}

describe('annonces rejouées sur le vrai moteur', () => {
  it('début de partie : deux annonces, sans « manche un », puis le choix du thème', () => {
    const run = createRun(MINI_GAME_QUICK_ANSWER)

    expect(run.start()).toEqual(['game.start', `minigame.${MINI_GAME_QUICK_ANSWER}`])
    expect(run.tick(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)).toEqual([
      `chooser.desk.${run.state.rounds.at(-1)?.chooserParticipantId}`,
    ])
  })

  it('partie sans contenu jouable : la voix ne dit rien à la fin', () => {
    const run = createRun(MINI_GAME_QUICK_ANSWER, { themes: [] })

    expect(run.start()).toEqual(['game.start'])
    expect(run.state.phase).toEqual({ name: 'finished', reason: 'no_content' })
    expect(run.events.at(-1)?.type).toBe('game_ended')
  })

  describe('jeu à buzz (premier buzz)', () => {
    it('mauvaise réponse du premier, bonne du suivant : une annonce par réponse', () => {
      const run = createRun(MINI_GAME_FIRST_BUZZ)
      run.open()

      expect(run.press(1, 0)).toEqual([]) // buzz de Léa
      expect(run.press(1, run.button(false))).toEqual(['answer.wrong.1'])
      expect(run.press(2, 0)).toEqual([]) // buzz de Hugo
      // answer_correct, points_awarded, question_ended dans le même lot : « bonne réponse » une fois.
      expect(run.press(2, run.button(true))).toEqual(['answer.correct.1'])
    })

    it('personne ne buzze : « Personne n’a trouvé » à l’échéance', () => {
      const run = createRun(MINI_GAME_FIRST_BUZZ)
      run.open()

      expect(run.tickUntil(() => !run.inQuestion(), 1000)).toEqual([['question.lost']])
    })
  })

  describe('réponse de tous (rapidité)', () => {
    it('une bonne réponse parmi des mauvaises : annoncée à la fin de la question', () => {
      const run = createRun(MINI_GAME_QUICK_ANSWER)
      run.open()

      expect(run.press(1, run.button(true))).toEqual([])
      expect(run.press(2, run.button(false))).toEqual([])
      expect(run.press(3, run.button(false))).toEqual(['answer.correct.1'])
    })

    it('tout le monde se trompe : « Personne n’a trouvé »', () => {
      const run = createRun(MINI_GAME_QUICK_ANSWER)
      run.open()

      expect(run.press(1, run.button(false))).toEqual([])
      expect(run.press(2, run.button(false))).toEqual([])
      expect(run.press(3, run.button(false))).toEqual(['question.lost'])
    })
  })

  describe('blind test', () => {
    it('erreur puis reprise de l’extrait : muet ; bonne réponse : annoncée une fois', () => {
      const run = createRun(MINI_GAME_FLASH_BLIND_TEST)
      run.open()

      expect(run.press(1, 0)).toEqual([]) // buzz de Léa : l'extrait se met en pause
      expect(run.press(1, run.button(false))).toEqual([]) // pas de « raté », l'extrait reprend
      expect(run.events.at(-1)?.type).toBe('blind_test_stage_resumed')
      expect(run.press(2, 0)).toEqual([])
      expect(run.press(2, run.button(true))).toEqual(['answer.correct.1'])
    })

    it('tout le monde se trompe au palier final : seul « Personne n’a trouvé » est dit', () => {
      const run = createRun(MINI_GAME_FLASH_BLIND_TEST)
      run.open()

      // Les trois paliers passent sans qu'on ne dise rien, puis la question est perdue.
      expect(run.tickUntil(() => !run.inQuestion(), 1000)).toEqual([['question.lost']])
      const stages = run.events.filter((event) => event.type === 'blind_test_stage_started')
      expect(stages).toHaveLength(3)
    })

    it('mauvaises réponses de tous au dernier palier : muet jusqu’à la fin de la question', () => {
      const run = createRun(MINI_GAME_FLASH_BLIND_TEST)
      run.open()
      run.tickUntil(() => {
        const { phase } = run.state
        return (
          phase.name !== 'question' ||
          (phase.miniGameState as { stageIndex?: number }).stageIndex === 2
        )
      }, 500)

      const batches = [1, 2, 3].flatMap((id) => [
        run.press(id, 0),
        run.press(id, run.button(false)),
      ])

      expect(batches.slice(0, -1).every((said) => said.length === 0)).toBe(true)
      expect(batches.at(-1)).toEqual(['question.lost'])
    })
  })
})

// Tous les joueurs appuient sur la bonne réponse, à chaque pas de temps, jusqu'à la fin de la
// première question : buzz puis réponse pour les jeux à buzz, verrouillage pour les autres.
function playFirstQuestion(miniGame: MiniGame) {
  const run = createRun(miniGame, { roundsCount: 1 })
  run.open()
  const batches: string[][] = []
  for (let guard = 0; guard < 120 && run.inQuestion(); guard += 1) {
    for (const id of [1, 2, 3]) {
      if (run.inQuestion()) {
        batches.push(run.press(id, run.button(true)))
      }
    }
    batches.push(run.tick(1000))
  }
  return { events: run.events, said: batches.flat() }
}

describe('contrat avec le moteur : la bonne réponse est annoncée une fois par question', () => {
  it.each([...MINI_GAMES])('%s', (miniGame) => {
    const { events, said } = playFirstQuestion(miniGame)
    const ended = events.find((event) => event.type === 'question_ended')
    const emitsAnswerCorrect = events.some((event) => event.type === 'answer_correct')

    expect(ended, 'question terminée').toBeDefined()
    expect((ended?.payload.winnerIds as number[]).length, 'un joueur a trouvé').toBeGreaterThan(0)
    expect(emitsAnswerCorrect).toBe(MINI_GAMES_ANSWERING_BY_EVENT.includes(miniGame))
    expect(said.filter((id) => id.startsWith('answer.correct.'))).toHaveLength(1)
  })

  it('la liste du pont est exactement celle des mini-jeux qui émettent answer_correct', () => {
    const emitting = MINI_GAMES.filter((miniGame) =>
      playFirstQuestion(miniGame).events.some((event) => event.type === 'answer_correct')
    )

    expect(new Set(emitting)).toEqual(new Set(MINI_GAMES_ANSWERING_BY_EVENT))
  })
})
