import { expect, type Page, test } from '@playwright/test'

import { enterDemo } from '../support/roomApp'

/**
 * Section Fumée de l'écran Matériel avec une carte USB simulée (`navigator.serial` remplacé) : choix
 * de la carte, bannière, sauvegarde téléchargée puis installation du programme livré avec l'écran,
 * relecture, et garde de la fumée tant que le test de coupure n'est pas fait sur ce poste.
 * Rien n'est essayé sur une vraie carte : le comportement physique reste à valider sur le banc.
 */

/** Carte factice : programme QuizzUp à 9600 bauds, chargeur Optiboot minimal à 115200. */
function installFakeBoard(page: Page) {
  return page.addInitScript(() => {
    const encoder = new TextEncoder()
    const flash = new Uint8Array(32_256).fill(0xff)
    const state = { baud: 0, pagesWritten: 0, fireLines: 0 }
    ;(window as unknown as { fakeBoard: unknown }).fakeBoard = { flash, state }
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null
    let readableStream: ReadableStream<Uint8Array> | null = null
    let writableStream: WritableStream<Uint8Array> | null = null
    let isOpen = false
    let rx: number[] = []
    let line = ''
    let address = 0
    const reply = (...data: number[]) => controller?.enqueue(Uint8Array.from([0x14, ...data, 0x10]))
    const loader = (byte: number) => {
      rx.push(byte)
      const cmd = rx[0] ?? 0
      const need =
        cmd === 0x55
          ? 4
          : cmd === 0x64
            ? rx.length < 3
              ? 99
              : 4 + (((rx[1] ?? 0) << 8) | (rx[2] ?? 0)) + 1
            : cmd === 0x74
              ? 5
              : 2
      if (rx.length < need) {
        return
      }
      const command = rx.splice(0)
      if (cmd === 0x55) {
        address = ((command[1] ?? 0) | ((command[2] ?? 0) << 8)) * 2
        reply()
      } else if (cmd === 0x64) {
        const length = ((command[1] ?? 0) << 8) | (command[2] ?? 0)
        flash.set(command.slice(4, 4 + length), address)
        state.pagesWritten += 1
        reply()
      } else if (cmd === 0x74) {
        reply(...flash.slice(address, address + 128))
      } else if (cmd === 0x75) {
        reply(0x1e, 0x95, 0x0f)
      } else {
        reply()
      }
    }
    const port = {
      getInfo: () => ({ usbVendorId: 0x2341, usbProductId: 0x0043 }),
      async open({ baudRate }: { baudRate: number }) {
        isOpen = true
        state.baud = baudRate
        rx = []
        line = ''
        readableStream = new ReadableStream<Uint8Array>({
          start(next) {
            controller = next
            if (baudRate !== 115_200) {
              queueMicrotask(() =>
                next.enqueue(encoder.encode('QZF READY 1 1.0.0 10000 5000 500\n'))
              )
            }
          },
        })
        writableStream = new WritableStream<Uint8Array>({
          write(chunk) {
            for (const byte of chunk) {
              if (state.baud === 115_200) {
                loader(byte)
              } else if (byte === 0x0a) {
                if (line === 'F') {
                  state.fireLines += 1
                }
                controller?.enqueue(encoder.encode('S 0 READY CMD\n'))
                line = ''
              } else {
                line += String.fromCharCode(byte)
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
        return isOpen ? readableStream : null
      },
      get writable() {
        return isOpen ? writableStream : null
      },
    }
    Object.defineProperty(navigator, 'serial', {
      value: {
        requestPort: async () => port,
        getPorts: async () => [],
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      configurable: true,
    })
  })
}

test.describe('Écran de salle — carte USB de la fumée simulée', () => {
  test('choisit la carte, la sauvegarde puis installe le programme, fumée toujours refusée', async ({
    page,
  }) => {
    await installFakeBoard(page)
    await enterDemo(page)
    await page.locator('[data-test="open-hardware"]').click()
    await page.locator('[data-test="tab-lights"]').click()

    // État vide : rien de connecté, pas d'installation proposée.
    await expect(page.locator('[data-test="board-status"]')).toHaveText('Aucune carte connectée.')
    await expect(page.locator('[data-test="board-install"]')).toHaveCount(0)

    // Choix de la carte : la bannière du programme dit sa version.
    await page.locator('[data-test="board-connect"]').click()
    await expect(page.locator('[data-test="board-status"]')).toHaveText('Prête (programme 1.0.0).')

    // L'installation demande la case « machine éteinte », puis télécharge la sauvegarde.
    await expect(page.locator('[data-test="board-install"]')).toBeDisabled()
    await page.locator('[data-test="board-off"]').check()
    const download = page.waitForEvent('download')
    await page.locator('[data-test="board-install"]').click()
    expect((await download).suggestedFilename()).toBe('quizzup-fumee-sauvegarde-carte.hex')
    // Rien n'est écrit tant que l'opérateur n'a pas confirmé que la sauvegarde est enregistrée.
    await expect(page.locator('[data-test="board-backup-confirm"]')).toBeVisible()
    await page.locator('[data-test="board-backup-yes"]').click()
    await expect(page.locator('[data-test="board-install-done"]')).toContainText(
      'Programme installé'
    )

    // Le programme livré est dans la flash de la carte simulée ; aucune commande de fumée n'est partie.
    const written = await page.evaluate(() => {
      const { flash, state } = (
        window as unknown as { fakeBoard: { flash: Uint8Array; state: { fireLines: number } } }
      ).fakeBoard
      return { first: [...flash.slice(0, 2)], fireLines: state.fireLines }
    })
    expect(written.first).not.toEqual([0xff, 0xff])
    expect(written.fireLines).toBe(0)
    await expect(page.locator('[data-test="board-status"]')).toHaveText('Prête (programme 1.0.0).')

    // Fumée : la carte vient d'être retenue pour cette salle, le test de coupure reste à faire ici.
    // Aucun essai n'est possible tant qu'il n'a pas réussi.
    await expect(page.locator('[data-test="smoke-arm"]')).toHaveCount(0)
    await expect(page.locator('[data-test="smoke-test"]')).toHaveCount(0)
  })
})
