import { expect, type Page, test } from '@playwright/test'

import { dmxData, type FakeNode, startBridge, startFakeNode } from '../support/artnetBridge'
import {
  advance,
  answerButtons,
  chooseFirstTheme,
  currentStage,
  type Desk,
  enterDemo,
  expectScreen,
  freezeClock,
  GAME_STORAGE_KEY,
  pressBuzzer,
  registerAndStartShortGame,
  scoreOf,
  TICK_MARGIN_MS,
} from '../support/roomApp'

/**
 * Endurance : plusieurs parties courtes enchaînées sur le même écran de salle, sans recharger la
 * page (mode démo, horloge figée, graine fixe), pour voir ce qu'une partie seule ne montre pas :
 * écouteurs, nœuds ou minuteries qui s'accumulent, état d'une partie qui fuit dans la suivante,
 * son ou lumières encore actifs après la fin, erreurs de console. Les lumières sortent par le vrai
 * pont Art-Net vers un faux nœud UDP : c'est la seule façon de lire les trames DMX de l'extérieur.
 * Rien n'est ajouté au code de production : les sondes sont injectées par le test.
 */
const GAMES = 3
const PLAYERS = [
  { desk: 1 as const, name: 'Alice' },
  { desk: 2 as const, name: 'Bob' },
]
const NAMES: Record<number, string> = { 1: 'Alice', 2: 'Bob' }
/** Totaux de la partie jouée par `playGame` (100 / 50 / 20 points selon le palier). */
const FINAL_SCORES = { Alice: 600, Bob: 250 }
const HARDWARE_KEY = 'quizzup_room_hardware'
const FIXED_SEED = 123_456

/** Seuils de conception-spectacle-config-salle.md §4 (budget mesurable). */
const MAX_DRIFT = 0.05
/**
 * Coût d'une partie (trames, extraits) : large, car la charge de la machine joue un peu ; une
 * fuite qui s'ajoute à chaque partie le dépasse dès la deuxième (coût doublé).
 */
const MAX_COST_DRIFT = 0.25
/** Minuteries en attente : tolérance de quelques minuteries d'interface, pas d'une par partie. */
const TIMEOUTS_SLACK = 2
const MAX_HEAP_RISE_BYTES = 10 * 1024 * 1024

declare global {
  interface Window {
    audioProbe: { live: () => number; started: () => number; contexts: () => number }
    timerProbe: { intervals: () => number; timeouts: () => number }
  }
}

/** Graine fixe, sonde des sources audio démarrées / encore en lecture, sonde des minuteries. */
async function installProbes(page: Page): Promise<void> {
  await page.addInitScript((seed) => {
    const nativeRandom = crypto.getRandomValues.bind(crypto)
    crypto.getRandomValues = ((array: Uint32Array) => {
      if (array instanceof Uint32Array && array.length === 1) {
        return array.fill(seed)
      }
      return nativeRandom(array)
    }) as typeof crypto.getRandomValues

    const live = new Set<AudioScheduledSourceNode>()
    const contexts = new Set<BaseAudioContext>()
    let started = 0
    for (const proto of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
      const nativeStart = proto.start as (this: AudioScheduledSourceNode, ...args: number[]) => void
      proto.start = function start(this: AudioScheduledSourceNode, ...args: number[]) {
        started += 1
        contexts.add(this.context)
        live.add(this)
        this.addEventListener('ended', () => live.delete(this), { once: true })
        nativeStart.apply(this, args)
      } as typeof proto.start
    }
    window.audioProbe = {
      live: () => live.size,
      started: () => started,
      contexts: () => contexts.size,
    }

    // Minuteries : posée après l'horloge simulée (`freezeClock`), elle compte celles de la salle.
    const intervals = new Set<unknown>()
    const timeouts = new Set<unknown>()
    const nativeSetInterval = window.setInterval.bind(window) as (...args: unknown[]) => unknown
    const nativeSetTimeout = window.setTimeout.bind(window) as (...args: unknown[]) => unknown
    const nativeClearInterval = window.clearInterval.bind(window) as (id: unknown) => void
    const nativeClearTimeout = window.clearTimeout.bind(window) as (id: unknown) => void
    window.setInterval = ((callback: () => void, ms?: number, ...rest: unknown[]) => {
      const id = nativeSetInterval(callback, ms, ...rest)
      intervals.add(id)
      return id
    }) as typeof window.setInterval
    window.clearInterval = ((id: unknown) => {
      intervals.delete(id)
      nativeClearInterval(id)
    }) as typeof window.clearInterval
    window.setTimeout = ((callback: () => void, ms?: number, ...rest: unknown[]) => {
      const id: unknown = nativeSetTimeout(
        () => {
          timeouts.delete(id)
          callback()
        },
        ms,
        ...rest
      )
      timeouts.add(id)
      return id
    }) as typeof window.setTimeout
    window.clearTimeout = ((id: unknown) => {
      timeouts.delete(id)
      nativeClearTimeout(id)
    }) as typeof window.clearTimeout
    window.timerProbe = { intervals: () => intervals.size, timeouts: () => timeouts.size }
  }, FIXED_SEED)
}

async function buzzAndAnswer(page: Page, desk: Desk, outcome: 'correct' | 'wrong'): Promise<void> {
  await pressBuzzer(page, desk, 0)
  await expect(page.locator('.blind__status--answering')).toContainText(`${NAMES[desk]} répond !`)
  const { correct, wrong } = await answerButtons(page)
  await pressBuzzer(page, desk, outcome === 'correct' ? correct : (wrong[0] ?? 0))
}

/** Révélation (5 s) → question suivante. */
async function nextQuestion(page: Page): Promise<void> {
  await advance(page, 5000 + TICK_MARGIN_MS)
  await expectScreen(page, 'blind')
}

/** Annonce de la manche (4 s) puis choix du thème. */
async function startRound(page: Page, position: number): Promise<void> {
  await expectScreen(page, 'intro')
  await expect(page.locator('.intro__round')).toHaveText(`Manche ${position} / 3`)
  await advance(page, 4000 + TICK_MARGIN_MS)
  await chooseFirstTheme(page)
  await expect(page.locator('.topbar')).toContainText('Question 1 / 3')
}

async function endRound(page: Page): Promise<void> {
  await advance(page, 5000 + TICK_MARGIN_MS)
  await expectScreen(page, 'summary')
  await advance(page, 8000 + TICK_MARGIN_MS)
}

/** Partie courte 3 × 3 : toujours la même, de l'inscription au podium. */
async function playGame(page: Page): Promise<void> {
  // Manche 1 : erreur de Bob puis Alice trouve (100), Bob trouve au palier 2 (50), Alice (100).
  await startRound(page, 1)
  for (const name of Object.keys(FINAL_SCORES)) {
    await expect(scoreOf(page, name)).toHaveText('0')
  }
  await buzzAndAnswer(page, 2, 'wrong')
  await buzzAndAnswer(page, 1, 'correct')
  await expectScreen(page, 'reveal')
  await nextQuestion(page)
  await advance(page, 4000 + TICK_MARGIN_MS)
  expect(await currentStage(page)).toBe(2)
  await buzzAndAnswer(page, 2, 'correct')
  await expectScreen(page, 'reveal')
  await nextQuestion(page)
  await buzzAndAnswer(page, 1, 'correct')
  await expectScreen(page, 'reveal')
  await endRound(page)

  // Manches 2 et 3 : une bonne réponse par question, au premier palier (Alice, Bob, Alice).
  for (let round = 2; round <= 3; round += 1) {
    await startRound(page, round)
    for (let question = 1; question <= 3; question += 1) {
      await buzzAndAnswer(page, question === 2 ? 2 : 1, 'correct')
      await expectScreen(page, 'reveal')
      if (question < 3) {
        await nextQuestion(page)
      }
    }
    await endRound(page)
  }

  await expectScreen(page, 'finished')
  await expect(page.locator('.finished__winner')).toHaveText('Alice remporte la partie !')
  const lines = page.locator('.finished .board__line')
  await expect(lines).toHaveCount(2)
  await expect(lines.nth(0)).toContainText('Alice')
  await expect(lines.nth(0)).toContainText(`${FINAL_SCORES.Alice} pts`)
  await expect(lines.nth(1)).toContainText('Bob')
  await expect(lines.nth(1)).toContainText(`${FINAL_SCORES.Bob} pts`)
  expect(await page.evaluate((key) => localStorage.getItem(key), GAME_STORAGE_KEY)).toBeNull()
}

/** Mesures CDP après ramasse-miettes (écouteurs, nœuds, tas) et compteurs des sondes. */
async function snapshot(page: Page, node: FakeNode) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  await cdp.detach()
  const metric = (name: string) => metrics.find((item) => item.name === name)?.value ?? Number.NaN
  const probes = await page.evaluate(() => ({
    intervals: window.timerProbe.intervals(),
    timeouts: window.timerProbe.timeouts(),
    sources: window.audioProbe.started(),
    contexts: window.audioProbe.contexts(),
    canvases: document.querySelectorAll('canvas').length,
  }))
  return {
    listeners: metric('JSEventListeners'),
    nodes: metric('Nodes'),
    heap: metric('JSHeapUsedSize'),
    packets: node.packets.length,
    ...probes,
  }
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>

/**
 * Attend que les trames en route soient arrivées au faux nœud : plus rien de neuf pendant
 * 1 s. Sans cela, le retard d'une partie serait compté dans la suivante (machine chargée).
 */
async function settleFrames(node: FakeNode): Promise<void> {
  let last = -1
  let calm = 0
  await expect
    .poll(
      () => {
        calm = node.packets.length === last ? calm + 1 : 0
        last = node.packets.length
        return calm
      },
      { intervals: [200], timeout: 20_000 }
    )
    .toBeGreaterThanOrEqual(5)
}

test.describe('Écran de salle — endurance', () => {
  test('3 parties de suite sans recharger : pas de fuite, lumières et son revenus au repos', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') {
        problems.push(`console: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => problems.push(`exception: ${error.message}`))

    const node = await startFakeNode()
    const bridge = await startBridge(node)
    try {
      const config = {
        lighting: {
          driver: 'artnet-bridge',
          bridgeUrl: bridge.url,
          fixtures: [
            { id: 'par-1', name: 'PAR 1', profileId: 'par-rgb', address: 1, desk: 1 },
            { id: 'par-2', name: 'PAR 2', profileId: 'par-rgb', address: 4, desk: 2 },
          ],
        },
      }
      // L'horloge simulée d'abord : les sondes de minuteries doivent envelopper ses fausses minuteries.
      await freezeClock(page)
      await installProbes(page)
      await page.addInitScript(
        ({ key, value }) => {
          localStorage.setItem(key, value)
        },
        { key: HARDWARE_KEY, value: JSON.stringify(config) }
      )
      await enterDemo(page)
      await page.getByRole('button', { name: 'Lancer la salle' }).click()
      await expect(page.getByText('Inscription des joueurs')).toBeVisible()

      // Salle au repos : les lumières démarrent avec la salle, c'est la trame de référence.
      await advance(page, 2000)
      await settleFrames(node)
      expect(node.packets.length).toBeGreaterThan(5)
      const rest = dmxData(node.packets.at(-1)!)
      const start = await snapshot(page, node)

      const games: Snapshot[] = []
      const perGame: { frames: number; sources: number; litFrames: number }[] = []
      for (let game = 1; game <= GAMES; game += 1) {
        const before = games.at(-1) ?? start
        await registerAndStartShortGame(page, PLAYERS)
        await playGame(page)
        await page.getByRole('button', { name: 'Nouvelle partie' }).click()
        await expect(page).toHaveURL(/\/lobby$/)

        // Les scènes de fin ont le temps de finir ; plus rien ne doit sortir ni sonner.
        await advance(page, 10_000)
        await settleFrames(node)
        await expect.poll(() => page.evaluate(() => window.audioProbe.live())).toBe(0)
        expect(
          dmxData(node.packets.at(-1)!).equals(rest),
          `partie ${game} : lumières au repos`
        ).toBe(true)

        const after = await snapshot(page, node)
        perGame.push({
          frames: after.packets - before.packets,
          sources: after.sources - before.sources,
          litFrames: node.packets
            .slice(before.packets)
            .filter((packet) => !dmxData(packet).equals(rest)).length,
        })
        games.push(after)
      }

      // Les lumières et le son ont bien servi (sinon « revenus au repos » ne prouverait rien).
      for (const [index, game] of perGame.entries()) {
        expect(game.litFrames, `partie ${index + 1} : trames hors repos`).toBeGreaterThan(0)
        expect(game.sources, `partie ${index + 1} : extraits démarrés`).toBeGreaterThan(0)
      }

      // Pas d'accumulation : chaque partie coûte pareil que la première.
      const [first, ...others] = perGame
      for (const [index, game] of others.entries()) {
        const label = `partie ${index + 2}`
        expect(
          Math.abs(game.sources - first!.sources) / first!.sources,
          `${label} : extraits démarrés`
        ).toBeLessThanOrEqual(MAX_COST_DRIFT)
        expect(
          Math.abs(game.frames - first!.frames) / first!.frames,
          `${label} : trames DMX`
        ).toBeLessThanOrEqual(MAX_COST_DRIFT)
      }
      const [firstGame, ...laterGames] = games
      for (const [index, game] of laterGames.entries()) {
        const label = `partie ${index + 2}`
        expect(game.intervals, `${label} : intervalles actifs`).toBeLessThanOrEqual(
          firstGame!.intervals
        )
        expect(game.timeouts, `${label} : minuteries en attente`).toBeLessThanOrEqual(
          firstGame!.timeouts + TIMEOUTS_SLACK
        )
        expect(game.contexts, `${label} : contextes audio`).toBeLessThanOrEqual(firstGame!.contexts)
      }

      // Seuils de la conception : écouteurs et nœuds jamais au-dessus du départ (+5 %), tas < +10 Mo.
      for (const [index, game] of games.entries()) {
        const label = `partie ${index + 1}`
        expect(game.listeners, `${label} : écouteurs`).toBeLessThanOrEqual(
          start.listeners * (1 + MAX_DRIFT)
        )
        expect(game.nodes, `${label} : nœuds`).toBeLessThanOrEqual(start.nodes * (1 + MAX_DRIFT))
        expect(game.heap - start.heap, `${label} : tas`).toBeLessThan(MAX_HEAP_RISE_BYTES)
        expect(game.canvases, `${label} : canvas`).toBe(0)
      }

      // Valeurs relevées, jointes au rapport pour suivre la dérive d'une version à l'autre.
      test.info().annotations.push({
        type: 'mesures',
        description: JSON.stringify({ start, games, perGame }),
      })
      expect(problems).toEqual([])
    } finally {
      await bridge.stop()
      await node.close()
    }
  })
})
