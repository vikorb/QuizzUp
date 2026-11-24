import { expect, type Page, test } from '@playwright/test'

import { startBridge, startFakeNode } from '../support/artnetBridge'
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
  HARDWARE_KEY,
  pressBuzzer,
  registerAndStartShortGame,
  scoreOf,
  TICK_MARGIN_MS,
} from '../support/roomApp'

/**
 * Endurance : plusieurs parties courtes enchaînées sur le même écran de salle, sans recharger la
 * page (mode démo, horloge figée, graine fixe), pour voir ce qu'une partie seule ne montre pas :
 * écouteurs, nœuds ou minuteries qui s'accumulent, état d'une partie qui fuit dans la suivante,
 * son ou lumières encore actifs après la fin, erreurs de console.
 *
 * Les lumières sont lues **à l'envoi par la page** (sonde sur `WebSocket.send`, trames de 515
 * octets du protocole du pont), jamais à la sortie du pont : celle-ci suit l'horloge réelle de
 * Node (regroupement, keepalive, chien de garde) alors que la page a son horloge figée. Le vrai
 * pont et un faux nœud UDP restent lancés seulement pour que la salle ait une sortie à laquelle
 * envoyer ses trames ; aucune mesure n'en est tirée.
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
const FIXED_SEED = 123_456

/** Seuils de conception-spectacle-config-salle.md §4 (budget mesurable). */
const MAX_DRIFT = 0.05
/** Minuteries en attente : tolérance de quelques minuteries d'interface, pas d'une par partie. */
const TIMEOUTS_SLACK = 2
const MAX_HEAP_RISE_BYTES = 10 * 1024 * 1024
/** Une trame par tick de la boucle des lumières : 30 Hz par défaut, soit `round(1000 / 30)` ms. */
const LIGHT_TICK_MS = 33

declare global {
  interface Window {
    audioProbe: { live: () => number; started: () => number; contexts: () => number }
    timerProbe: { intervals: () => number; timeouts: () => number }
    dmxProbe: {
      /** Trames envoyées au pont par la page depuis le chargement. */
      frames: () => number
      /** Dernière trame de chaque univers (canaux 1 à 512, un caractère par canal). */
      last: () => Record<number, string>
      /** Prend les dernières trames comme référence et remet `differing` à zéro. */
      markReference: () => void
      /** Trames envoyées depuis `markReference` qui diffèrent de la référence de leur univers. */
      differing: () => number
    }
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

    // Trames DMX envoyées au pont (protocole de `bridgeOutput.ts` : version, univers sur 2 octets,
    // puis 512 canaux). Les messages texte (hello, hold…) n'ont pas cette forme et sont ignorés.
    const FRAME_BYTES = 515
    let frames = 0
    let differing = 0
    const last: Record<number, string> = {}
    let reference: Record<number, string> = {}
    const nativeSend = WebSocket.prototype.send
    WebSocket.prototype.send = function send(this: WebSocket, data) {
      if (ArrayBuffer.isView(data) && data.byteLength === FRAME_BYTES) {
        const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        if (bytes[0] === 1) {
          const universe = (bytes[1]! << 8) | bytes[2]!
          const channels = String.fromCharCode(...bytes.subarray(3))
          frames += 1
          last[universe] = channels
          if (reference[universe] !== channels) {
            differing += 1
          }
        }
      }
      return nativeSend.call(this, data)
    }
    window.dmxProbe = {
      frames: () => frames,
      last: () => ({ ...last }),
      markReference: () => {
        reference = { ...last }
        differing = 0
      },
      differing: () => differing,
    }
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
async function snapshot(page: Page) {
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
    frames: window.dmxProbe.frames(),
    clock: Date.now(),
  }))
  return {
    listeners: metric('JSEventListeners'),
    nodes: metric('Nodes'),
    heap: metric('JSHeapUsedSize'),
    ...probes,
  }
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>

/** Canaux allumés d'une trame (« canal:valeur »), lisible dans un message d'échec. */
const litChannels = (frame: string | undefined) =>
  [...(frame ?? '')].flatMap((char, index) =>
    char === '\u0000' ? [] : [`${index + 1}:${char.charCodeAt(0)}`]
  )

/** Dernières trames envoyées par la page, sous une forme comparable (univers → canaux allumés). */
async function sentFrames(page: Page): Promise<Record<string, string[]>> {
  const last = await page.evaluate(() => window.dmxProbe.last())
  return Object.fromEntries(
    Object.entries(last).map(([universe, frame]) => [universe, litChannels(frame)])
  )
}

test.describe('Écran de salle — endurance', () => {
  test('3 parties de suite sans recharger : pas de fuite, lumières et son revenus au repos', async ({
    page,
  }) => {
    test.setTimeout(180_000)
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

      // Salle au repos : la sortie s'établit avec le pont (poignée de main réelle, seule attente
      // réelle), puis la scène de repos finit son fondu (1,5 s de temps de jeu). Cette trame, prise
      // **avant** la première partie, est la référence « lumières au repos ».
      await expect
        .poll(async () => {
          await advance(page, 100)
          return page.evaluate(() => window.dmxProbe.frames())
        })
        .toBeGreaterThan(0)
      await advance(page, 3000)
      const rest = await sentFrames(page)
      expect(rest[0], 'trame de repos de l’univers 0 : pas noire').not.toHaveLength(0)
      await advance(page, 1000)
      expect(await sentFrames(page), 'le repos est stable').toEqual(rest)
      await page.evaluate(() => window.dmxProbe.markReference())
      const start = await snapshot(page)

      const games: Snapshot[] = []
      const perGame: { frames: number; elapsed: number; sources: number; sceneFrames: number }[] =
        []
      for (let game = 1; game <= GAMES; game += 1) {
        const before = games.at(-1) ?? start
        await page.evaluate(() => window.dmxProbe.markReference())
        await registerAndStartShortGame(page, PLAYERS)
        await playGame(page)
        await page.getByRole('button', { name: 'Nouvelle partie' }).click()
        await expect(page).toHaveURL(/\/lobby$/)

        // Les scènes de fin ont le temps de finir ; plus rien ne doit sortir ni sonner.
        await advance(page, 10_000)
        expect(await sentFrames(page), `partie ${game} : lumières revenues au repos`).toEqual(rest)
        await expect.poll(() => page.evaluate(() => window.audioProbe.live())).toBe(0)

        const after = await snapshot(page)
        perGame.push({
          frames: after.frames - before.frames,
          elapsed: after.clock - before.clock,
          sources: after.sources - before.sources,
          sceneFrames: await page.evaluate(() => window.dmxProbe.differing()),
        })
        games.push(after)
      }

      // Les lumières et le son ont bien servi (sinon « revenus au repos » ne prouverait rien).
      for (const [index, game] of perGame.entries()) {
        expect(
          game.sceneFrames,
          `partie ${index + 1} : trames différentes du repos`
        ).toBeGreaterThan(0)
        expect(game.sources, `partie ${index + 1} : extraits démarrés`).toBeGreaterThan(0)
      }

      // Pas d'accumulation : l'horloge est figée et la partie toujours la même, donc chaque partie
      // dure le même temps de jeu, démarre les mêmes extraits et envoie une trame par tick des
      // lumières (ni plus, ni moins : une boucle en double ou perdue se verrait). Le nombre de
      // trames n'est pas strictement égal d'une partie à l'autre : la durée n'est pas un
      // multiple de 33 ms, donc selon la phase du tick au départ il vaut `floor` ou `ceil` du quotient.
      const [first] = perGame
      for (const [index, game] of perGame.entries()) {
        const label = `partie ${index + 1}`
        expect(game.elapsed, `${label} : temps de jeu écoulé`).toBe(first!.elapsed)
        expect(game.sources, `${label} : extraits démarrés`).toBe(first!.sources)
        expect(
          Math.abs(game.frames - game.elapsed / LIGHT_TICK_MS),
          `${label} : trames DMX (${game.frames} pour ${game.elapsed} ms)`
        ).toBeLessThan(1)
      }

      // Seuils de la conception : tas < +10 Mo au-dessus du départ ; minuteries, intervalles et
      // contextes audio jamais au-dessus du départ au lobby (le contexte audio naît au premier
      // extrait : aucun au départ, un seul ensuite).
      for (const [index, game] of games.entries()) {
        const label = `partie ${index + 1}`
        expect(game.heap - start.heap, `${label} : tas`).toBeLessThan(MAX_HEAP_RISE_BYTES)
        expect(game.intervals, `${label} : intervalles actifs`).toBeLessThanOrEqual(start.intervals)
        expect(game.timeouts, `${label} : minuteries en attente`).toBeLessThanOrEqual(
          start.timeouts + TIMEOUTS_SLACK
        )
        expect(game.contexts, `${label} : contextes audio`).toBeLessThanOrEqual(start.contexts + 1)
      }

      // Écouteurs et nœuds (+5 % au plus) : référence = le lobby après la première partie. Le
      // premier lobby, relevé avant toute partie, est plus pauvre d'un coût qui n'arrive qu'une fois :
      // au premier lancement, Vite charge les écrans de jeu paresseux et injecte leurs styles
      // (relevé : +18 balises <style>, soit +36 nœuds et +14 écouteurs, puis plus rien). Une fuite
      // née dans la première partie n'est donc pas vue par ces deux mesures (cf. README).
      const [baseline, ...laterGames] = games
      for (const [index, game] of laterGames.entries()) {
        const label = `partie ${index + 2}`
        expect(game.listeners, `${label} : écouteurs`).toBeLessThanOrEqual(
          baseline!.listeners * (1 + MAX_DRIFT)
        )
        expect(game.nodes, `${label} : nœuds`).toBeLessThanOrEqual(
          baseline!.nodes * (1 + MAX_DRIFT)
        )
      }

      // Valeurs relevées, jointes au rapport pour suivre la dérive d'une version à l'autre.
      test.info().annotations.push({
        type: 'mesures',
        description: JSON.stringify({ rest, start, games, perGame }),
      })
      expect(problems).toEqual([])
    } finally {
      await bridge.stop()
      await node.close()
    }
  })
})
