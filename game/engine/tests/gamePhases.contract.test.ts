import { createGame, type GamePhase, reduceGame } from '@engine/engine'
import { GAME_PHASES, type GamePhaseName } from '@quizzup/shared'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { baseSetup } from './_helpers/fixtures'

/**
 * Contrat avec `@quizzup/shared` : la salle publie la phase du moteur au backoffice, qui la
 * valide avec `GAME_PHASES`. Une phase ajoutée, renommée ou retirée d'un côté doit casser ici.
 */

describe('phases du moteur et liste partagée', () => {
  it('les noms de phase du moteur et la liste partagée sont les mêmes types', () => {
    // Vérifié par `npm run type-check` : une phase en plus ou en moins d'un côté ne compile pas.
    expectTypeOf<GamePhase['name']>().toEqualTypeOf<GamePhaseName>()
  })

  it('une partie jouée de bout en bout ne traverse que des phases de la liste partagée', () => {
    let state = createGame(baseSetup())
    const seen = new Set<string>([state.phase.name])

    state = reduceGame(state, { type: 'start', at: 0 }).state

    for (
      let at = 0;
      at <= 1_000_000 && !['finished', 'aborted'].includes(state.phase.name);
      at += 250
    ) {
      state = reduceGame(state, { type: 'tick', at }).state
      seen.add(state.phase.name)
    }

    const aborted = reduceGame(createGame(baseSetup()), { type: 'abort', at: 0, reason: 'test' })
    seen.add(aborted.state.phase.name)

    expect([...seen].sort()).toEqual([...GAME_PHASES].sort())
  })
})
