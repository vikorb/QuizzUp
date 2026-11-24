import { expect, type Page, test } from '@playwright/test'

import { advance, enterDemo, freezeClock, HARDWARE_KEY, TICK_MARGIN_MS } from '../support/roomApp'

/**
 * Test de coupure de la fumée par la carte USB (assistant Matériel, étape « Sécuriser la fumée »),
 * avec deux ports série simulés (`navigator.serial` remplacé) : l'interface DMX, et la carte avec le
 * programme QuizzUp déjà installé (même règles que `fumee_logic.c` : bail de 500 ms, plafond de 10 s,
 * pause de 5 s au démarrage). Défauts que la fausse carte sait simuler : câble débranché puis
 * rebranché, silence, bail qui ne coupe pas. L'horloge de la page est figée : le temps ne passe que
 * par `advance` (une assertion qui attend, en temps réel, un événement qui demande du temps de page
 * ne se termine jamais : toujours avancer l'horloge d'abord).
 * Rien n'est essayé sur une vraie carte : le comportement physique reste à valider sur le banc.
 */

/** Ce que la page simulée laisse voir de la carte (la sortie A0 est lue à l'heure de la page). */
type FakeSerial = {
  board: {
    lines: string[]
    /** Ouvertures du port par la page (la première est le choix de la carte), et lignes reçues à la dernière. */
    opens: number
    linesAtLastOpen: number
    output: 0 | 1
    cause: string
    mute: boolean
    noLease: boolean
    unplug: () => void
    replug: () => void
  }
}

function installFakeSerial(page: Page) {
  return page.addInitScript(() => {
    const encoder = new TextEncoder()
    const domError = (name: string) => Object.assign(new Error(name), { name })

    // Carte : portage de `fumee_logic.c` (bail 500 ms, plafond 10 s, pause 5 s). Elle ne juge le temps
    // qu'à l'arrivée d'une ligne ou quand on lit sa sortie, comme le programme à chaque tour de boucle.
    const fumee = {
      state: 'COOL',
      cause: 'CMD',
      held: false,
      leaseAt: 0,
      fireStart: 0,
      coolStart: 0,
    }
    const cut = (now: number, cause: string) => {
      if (fumee.state === 'FIRE') {
        fumee.state = 'COOL'
        fumee.coolStart = now
        fumee.cause = cause
      }
    }
    // Défaut simulé : le bail ne coupe jamais (programme défaillant, relais collé...).
    let noLease = false
    const tick = () => {
      const now = Date.now()
      if (fumee.state === 'FIRE') {
        if (now - fumee.fireStart >= 10_000) {
          cut(now, 'MAX')
        } else if (!noLease && now - fumee.leaseAt >= 500) {
          cut(now, 'LEASE')
        }
      } else if (fumee.state === 'COOL' && now - fumee.coolStart >= 5000) {
        fumee.state = 'READY'
      }
      if (fumee.held && now - fumee.leaseAt >= 500) {
        fumee.held = false
      }
      return now
    }

    const lines: string[] = []
    let mute = false
    let lost = false
    let opens = 0
    let linesAtLastOpen = 0
    let isOpen = false
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null
    let readableStream: ReadableStream<Uint8Array> | null = null
    let writableStream: WritableStream<Uint8Array> | null = null
    let pending = ''

    const onLine = (text: string) => {
      const now = tick()
      lines.push(text)
      if (text === 'F') {
        if (fumee.state === 'FIRE') {
          fumee.leaseAt = now
        } else if (fumee.state === 'READY' && !fumee.held) {
          Object.assign(fumee, { state: 'FIRE', fireStart: now, leaseAt: now })
        } else {
          fumee.held = true
          fumee.leaseAt = now
        }
      } else if (text === '0') {
        cut(now, 'CMD')
        fumee.held = false
      } else if (text !== 'H') {
        cut(now, 'BAD')
      }
      if (!mute) {
        const out = fumee.state === 'FIRE' ? 1 : 0
        controller?.enqueue(encoder.encode(`S ${out} ${fumee.state} ${fumee.cause}\n`))
      }
    }

    const boardPort = {
      getInfo: () => ({ usbVendorId: 0x2341, usbProductId: 0x0043 }),
      async open() {
        if (lost) {
          throw domError('NetworkError')
        }
        isOpen = true
        opens += 1
        linesAtLastOpen = lines.length
        // Ouvrir le port redémarre la carte : sortie coupée, pause de 5 s, bannière.
        Object.assign(fumee, { state: 'COOL', cause: 'CMD', held: false, coolStart: Date.now() })
        pending = ''
        readableStream = new ReadableStream<Uint8Array>({
          start(next) {
            controller = next
            queueMicrotask(() => next.enqueue(encoder.encode('QZF READY 1 1.0.0 10000 5000 500\n')))
          },
        })
        writableStream = new WritableStream<Uint8Array>({
          write(chunk) {
            if (lost) {
              throw domError('NetworkError')
            }
            for (const byte of chunk) {
              if (byte === 0x0a) {
                onLine(pending)
                pending = ''
              } else {
                pending += String.fromCharCode(byte)
              }
            }
          },
        })
      },
      async close() {
        isOpen = false
      },
      async setSignals() {},
      get readable() {
        return isOpen && !lost ? readableStream : null
      },
      get writable() {
        return isOpen && !lost ? writableStream : null
      },
    }

    // Interface DMX : accepte toutes les trames.
    const dmxPort = {
      getInfo: () => ({ usbVendorId: 0x0403, usbProductId: 0x6001 }),
      async open() {},
      async close() {},
      async setSignals() {},
      writable: {
        getWriter: () => ({
          write: async () => undefined,
          releaseLock: () => undefined,
          abort: async () => undefined,
        }),
      },
    }

    // Le sélecteur du navigateur propose la carte au premier appel, l'interface DMX au second.
    const requests = [boardPort, dmxPort]
    const granted: unknown[] = []
    ;(window as unknown as { fakeSerial: unknown }).fakeSerial = {
      board: {
        lines,
        get output() {
          tick()
          return fumee.state === 'FIRE' ? 1 : 0
        },
        get cause() {
          tick()
          return fumee.cause
        },
        get opens() {
          return opens
        },
        get linesAtLastOpen() {
          return linesAtLastOpen
        },
        get noLease() {
          return noLease
        },
        set noLease(value: boolean) {
          noLease = value
        },
        get mute() {
          return mute
        },
        set mute(value: boolean) {
          mute = value
        },
        /** Câble débranché : les flux échouent, le port ne s'ouvre plus. */
        unplug() {
          lost = true
          controller?.error(domError('NetworkError'))
        },
        /** Câble rebranché : le port peut de nouveau s'ouvrir (la carte redémarre à l'ouverture). */
        replug() {
          lost = false
        },
      },
    }
    Object.defineProperty(navigator, 'serial', {
      value: {
        requestPort: async () => {
          const next = requests.shift()
          if (!next) {
            throw domError('NotFoundError')
          }
          granted.push(next)
          return next
        },
        getPorts: async () => [...granted],
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      configurable: true,
    })
  })
}

const board = (page: Page) =>
  page.evaluate(() => {
    const { board: fake } = (window as unknown as { fakeSerial: FakeSerial }).fakeSerial
    return {
      fireLines: fake.lines.filter((line) => line === 'F').length,
      opens: fake.opens,
      linesSinceOpen: fake.lines.length - fake.linesAtLastOpen,
      output: fake.output,
      cause: fake.cause,
    }
  })

/** Les 16 boutons de buzzer déjà appris (l'étape Buzzers de l'assistant l'exige), comme sur un poste installé. */
function learnBuzzers(page: Page) {
  const keymap = Object.fromEntries(
    [...'BCGHIJKLMNOPTUYZ'].map((letter, index) => [
      `Key${letter}`,
      { desk: Math.floor(index / 4) + 1, button: 'ABCD'[index % 4] },
    ])
  )
  return page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value)
    },
    { key: HARDWARE_KEY, value: JSON.stringify({ buzzers: { keymap } }) }
  )
}

/** Agit sur la fausse carte dans la page. */
const act = (page: Page, action: 'unplug' | 'replug' | 'mute' | 'noLease') =>
  page.evaluate((name) => {
    const { board: fake } = (window as unknown as { fakeSerial: FakeSerial }).fakeSerial
    if (name === 'unplug' || name === 'replug') {
      fake[name]()
    } else {
      fake[name] = true
    }
  }, action)

const status = (page: Page, name: string) => page.locator(`[data-test="${name}"]`)

/**
 * Choisit la carte, puis parcourt l'assistant jusqu'à l'étape fumée avec une machine à relais, les
 * trois vérifications manuelles cochées. `withLights` : l'interface DMX est connectée (sinon la salle
 * reste en simulation). La carte a fini sa pause de 5 s quand la fonction rend la main.
 */
async function openSmokeStep(page: Page, withLights: boolean): Promise<void> {
  await installFakeSerial(page)
  await learnBuzzers(page)
  await freezeClock(page)
  await enterDemo(page)
  await page.locator('[data-test="open-hardware"]').click()
  await page.locator('[data-test="tab-lights"]').click()
  await page.locator('[data-test="board-connect"]').click()
  await expect(status(page, 'board-status')).toHaveText('Prête (programme 1.0.0).')

  await page.locator('[data-test="tab-assistant"]').click()
  await page.locator('[data-test="assistant-next"]').click()
  await page.locator('[data-test="assistant-next"]').click()
  if (withLights) {
    await page.locator('[data-test="driver-usbpro"]').check()
    await page.locator('[data-test="assistant-connect"]').click()
    await expect(status(page, 'step-interface').locator('.hw-ok')).toBeVisible()
  }
  await page.locator('[data-test="assistant-next"]').click()
  await page.locator('[data-test="fixture-profile"]').selectOption('smoke-relay')
  await page.locator('[data-test="fixture-add"]').click()
  await page.locator('[data-test="assistant-next"]').click()
  await page.locator('[data-test="assistant-next"]').click()
  await expect(status(page, 'step-smoke')).toBeVisible()
  await page.locator('[data-test="smoke-enable"]').check()
  for (const check of ['physicalStop', 'timedRelay', 'siteRules']) {
    await page.locator(`[data-test="check-${check}"]`).check()
  }
  // La pause de 5 s de la carte, qui vient de démarrer, doit être passée : sinon aucun jet n'est possible.
  await advance(page, 5000 + TICK_MARGIN_MS)
}

/** Lance le test de coupure : les deux confirmations, puis la page cesse de renouveler l'ordre. */
async function launchCutTest(page: Page): Promise<void> {
  await page.locator('[data-test="assistant-freeze"]').click()
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click()
  await page.getByRole('button', { name: 'Lancer le test', exact: true }).click()
}

/** Après un test échoué : fumée non autorisable, même une fois l'arrêt d'urgence réarmé. */
async function expectSmokeStillRefused(page: Page, fireLines: number): Promise<void> {
  // Arrêt d'urgence déclenché par l'échec : rien à autoriser, rien à tester.
  await page.locator('[data-test="tab-lights"]').click()
  await expect(status(page, 'smoke-arm')).toBeDisabled()
  await expect(status(page, 'smoke-test')).toBeDisabled()
  // Réarmé : fumée toujours désactivée dans la configuration de la salle.
  await status(page, 'emergency-reset').click()
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click()
  await expect(page.getByText('Fumée désactivée dans la configuration de la salle.')).toBeVisible()
  await expect(status(page, 'smoke-arm')).toHaveCount(0)
  expect((await board(page)).fireLines).toBe(fireLines)
}

const failedText = 'la carte n’a pas coupé à temps'

test.describe('Écran de salle — test de coupure de la fumée par la carte', () => {
  // Échoue si : la page renouvelle l'ordre `F` pendant le test, la carte n'est pas laissée couper seule
  // (bail), « Elle s'est arrêtée » ne pose pas la preuve, ou la fumée reste refusée après un test réussi.
  test('la carte coupe seule, la réponse « Elle s’est arrêtée » lève le refus de la fumée', async ({
    page,
  }) => {
    await openSmokeStep(page, true)
    await expect(status(page, 'freeze-hint')).toContainText('en moins d’une seconde')
    await launchCutTest(page)
    await expect(status(page, 'freeze-running')).toBeVisible()

    // Le jet part : un ordre `F` a été reçu, la sortie de la carte est haute.
    const started = await board(page)
    expect(started.fireLines).toBeGreaterThan(0)
    expect(started.output).toBe(1)

    // La page ne renouvelle plus rien : la carte coupe seule à la fin de son bail (500 ms).
    await advance(page, 600)
    const cutByLease = await board(page)
    expect(cutByLease.output).toBe(0)
    expect(cutByLease.cause).toBe('LEASE')
    await advance(page, 15_000 + TICK_MARGIN_MS)
    expect((await board(page)).fireLines).toBe(started.fireLines)

    await expect(status(page, 'freeze-question')).toContainText('en moins d’une seconde')
    await status(page, 'freeze-ok').click()
    await expect(status(page, 'check-freezeTest')).toBeChecked()
    await expect(page.getByText(failedText)).toHaveCount(0)

    // Le test est validé ; l'enregistrement de l'assistant (récapitulatif) active la fumée dans la salle.
    await page.locator('[data-test="assistant-next"]').click()
    await page.locator('[data-test="assistant-save"]').click()
    await expect(page.getByText('Configuration enregistrée.')).toBeVisible()

    // Le refus est levé sur ce poste : plus de « test à refaire », la fumée peut être autorisée.
    await page.locator('[data-test="tab-lights"]').click()
    await expect(status(page, 'smoke-test-required')).toHaveCount(0)
    await expect(status(page, 'smoke-arm')).toBeEnabled()
    await status(page, 'smoke-arm').check()
    await expect(status(page, 'smoke-arm')).toBeChecked()
    // Armer ne fait rien partir (quelques ticks des lumières et de la carte passent avant de regarder).
    await advance(page, 1000)
    expect((await board(page)).fireLines).toBe(started.fireLines)
  })

  // Échoue si : une carte perdue, muette ou dont le bail ne coupe pas pendant le test laisse valider
  // « Elle s'est arrêtée » (preuve posée), ou si l'échec laisse la fumée autorisable.
  const breakages: [string, (page: Page) => Promise<void>][] = [
    ['carte débranchée', (page) => act(page, 'unplug')],
    ['carte muette', (page) => act(page, 'mute')],
    // Le jet reste allumé au-delà du bail : la carte le dit à la présence suivante, le lien passe en
    // défaut et la page coupe elle-même (`0`) : ce n'est pas la carte qui a coupé, le test échoue.
    ['carte dont le bail ne coupe pas', (page) => act(page, 'noLease')],
  ]
  for (const [name, breakBoard] of breakages) {
    test(`${name} pendant le test : le test échoue et la fumée reste refusée`, async ({ page }) => {
      await openSmokeStep(page, true)
      await launchCutTest(page)
      await expect(status(page, 'freeze-running')).toBeVisible()
      const started = await board(page)

      await breakBoard(page)
      // Une carte muette n'est déclarée perdue qu'après 1 s sans réponse : tout le test passe d'un trait.
      await advance(page, 15_000 + TICK_MARGIN_MS)
      await expect(status(page, 'freeze-question')).toBeVisible()
      // L'opérateur répond que la fumée s'est arrêtée : sans la carte, ce n'est pas une preuve.
      await status(page, 'freeze-ok').click()

      await expect(page.getByText(failedText)).toBeVisible()
      await expect(status(page, 'check-freezeTest')).not.toBeChecked()
      await expectSmokeStillRefused(page, started.fireLines)
    })
  }

  // Échoue si : le drapeau « carte perdue pendant le test » n'est plus collant (une carte reprise seule
  // et de nouveau prête ferait valider « Elle s'est arrêtée » alors qu'elle a été perdue en plein test).
  test('carte perdue puis revenue pendant le test : le test échoue quand même', async ({
    page,
  }) => {
    await openSmokeStep(page, true)
    await launchCutTest(page)
    await expect(status(page, 'freeze-running')).toBeVisible()
    const started = await board(page)

    await act(page, 'unplug')
    await advance(page, 1000)
    await act(page, 'replug')
    // La page rouvre la carte seule (reprise à 3 s) : le pas est avancé jusqu'à ce que ce soit fait,
    // sans quoi la page ne reprend la main qu'au temps de la page.
    await advance(page, 3000)
    await expect.poll(async () => (await board(page)).opens).toBe(2)
    await advance(page, 12_000 + TICK_MARGIN_MS)
    await expect(status(page, 'freeze-question')).toBeVisible()
    // La carte est revenue : la page lui parle de nouveau (lignes reçues depuis la réouverture).
    expect((await board(page)).linesSinceOpen).toBeGreaterThan(0)

    await status(page, 'freeze-ok').click()

    await expect(page.getByText(failedText)).toBeVisible()
    await expect(status(page, 'check-freezeTest')).not.toBeChecked()
    await expectSmokeStillRefused(page, started.fireLines)
  })

  // Échoue si : le test se lance sans interface de lumières réelle (la simulation ne prouverait rien).
  test('sans interface de lumières connectée : test refusé, aucune confirmation, aucun ordre à la carte', async ({
    page,
  }) => {
    await openSmokeStep(page, false)
    await page.locator('[data-test="assistant-freeze"]').click()

    await expect(page.getByText('Connecte d’abord la vraie interface DMX')).toBeVisible()
    // Aucune des deux confirmations n'est demandée.
    await expect(page.getByRole('button', { name: 'Confirmer', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Lancer le test', exact: true })).toHaveCount(0)
    await expect(status(page, 'freeze-running')).toHaveCount(0)
    expect((await board(page)).fireLines).toBe(0)
  })
})
