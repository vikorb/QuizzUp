import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { WATCHDOG_STALL_MS } from '@hardware/lighting/lightingController'
import { SMOKE_HARD_LIMITS } from '@hardware/lighting/smoke'

import { createFakeSmokeBoard } from '../_helpers/fakeSmokeBoard'
import { createFumee, FUMEE_COOL_MS, FUMEE_LEASE_MS, FUMEE_MAX_MS } from '../_helpers/fumeeLogic'
import { createManualClock } from '../_helpers/manualClock'

/**
 * Vecteurs partagés avec le test C de la carte (`firmware/fumee/vecteurs.txt`) : la fausse carte
 * doit donner exactement les mêmes réponses que le programme, sinon les tests du lien prouvent
 * quelque chose sur une carte qui n'existe pas.
 */
const VECTORS_PATH = resolve(__dirname, '../../firmware/fumee/vecteurs.txt')

type VectorEvent = {
  at: number
  input: string
  output: 0 | 1
  state: string
  cause: string
  text: string
}
type Scenario = { name: string; events: VectorEvent[] }

function loadVectors(): Scenario[] {
  if (!existsSync(VECTORS_PATH)) {
    throw new Error(
      `Vecteurs de la carte introuvables : ${VECTORS_PATH}. Sans eux, la fausse carte n'est comparée à rien.`
    )
  }
  const scenarios: Scenario[] = []
  for (const raw of readFileSync(VECTORS_PATH, 'utf8').split('\n')) {
    const text = raw.trim()
    if (text === '' || text.startsWith('#')) {
      continue
    }
    if (text.startsWith('= ')) {
      scenarios.push({ name: text.slice(2), events: [] })
      continue
    }
    const fields = text.split(/\s+/)
    const [at, input, output, state, cause] = fields
    const current = scenarios.at(-1)
    if (!current || fields.length !== 5 || (output !== '0' && output !== '1')) {
      throw new Error(`Ligne de vecteur illisible : « ${text} »`)
    }
    current.events.push({
      at: Number(at),
      input: input as string,
      output: output === '1' ? 1 : 0,
      state: state as string,
      cause: cause as string,
      text,
    })
  }
  return scenarios
}

const scenarios = loadVectors()
const eventCount = scenarios.reduce((total, scenario) => total + scenario.events.length, 0)

/** Instants sans débordement : le compteur de la carte repasse à 0, l'horloge simulée continue. */
function unwrap(events: VectorEvent[]) {
  let wraps = 0
  let previous = 0
  return events.map((event) => {
    if (event.at < previous) {
      wraps += 1
    }
    previous = event.at
    return event.at + wraps * 2 ** 32
  })
}

describe('vecteurs de la carte de fumée', () => {
  it('le fichier est complet (31 scénarios, 390 événements au moins)', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(31)
    expect(eventCount).toBeGreaterThanOrEqual(390)
    expect(scenarios.some((scenario) => scenario.events.some((event) => event.at > 2 ** 31))).toBe(
      true
    )
  })

  it('les durées du programme sont celles du projet', () => {
    expect(FUMEE_MAX_MS).toBe(SMOKE_HARD_LIMITS.maxDurationMs)
    expect(FUMEE_COOL_MS).toBe(SMOKE_HARD_LIMITS.minCooldownMs)
    expect(FUMEE_LEASE_MS).toBe(WATCHDOG_STALL_MS)
  })

  it.each(scenarios.map((scenario) => [scenario.name, scenario] as const))(
    'port du programme : %s',
    (_name, scenario) => {
      const program = createFumee(0)
      for (const event of scenario.events) {
        if (event.input === '-') {
          program.tick(event.at)
        } else {
          program.line(event.at, event.input)
        }
        const { out, state, cause } = program.fumee
        expect({ text: event.text, got: [out, state, cause] }).toEqual({
          text: event.text,
          got: [event.output, event.state, event.cause],
        })
      }
    }
  )

  it.each(scenarios.map((scenario) => [scenario.name, scenario] as const))(
    'fausse carte : %s',
    async (_name, scenario) => {
      const clock = createManualClock(0)
      const board = createFakeSmokeBoard({ clock, banner: null })
      await board.port.open({ baudRate: 9600 })
      const writer = board.port.writable!.getWriter()
      const times = unwrap(scenario.events)
      for (const [index, event] of scenario.events.entries()) {
        // La page est figée entre deux événements (aucun tic du minuteur de la fausse carte) : seul
        // l'événement du vecteur fait avancer la carte, comme dans le test C.
        clock.jump(times[index]! - clock.now())
        if (event.input === '-') {
          board.snapshot()
        } else {
          await writer.write(Uint8Array.from(`${event.input}\n`, (char) => char.charCodeAt(0)))
        }
        const { output, state, cause } = board.snapshot()
        expect({ text: event.text, got: [output ? 1 : 0, state, cause] }).toEqual({
          text: event.text,
          got: [event.output, event.state, event.cause],
        })
      }
    }
  )
})
