import type { SmokeBoardPort } from '@quizzup/hardware'

/**
 * Carte de fumée factice sur un faux port Web Serial, pour les tests de l'écran de salle.
 *
 * Deux visages selon le débit d'ouverture, comme un Uno : 115200 bauds = chargeur (sous-ensemble
 * STK500v1 d'Optiboot : synchronisation, signature, adresse, écriture et lecture de page, sortie),
 * 9600 bauds = programme de la carte (bannière, lignes `F`, `0`, `H`, réponses `S`). Les durées
 * (bail, plafond, pause) ne sont pas rejouées ici : elles sont testées dans `game/hardware` contre
 * l'émulateur complet et les vecteurs partagés. Ici : le branchement de l'écran de salle.
 */
export const FAKE_BOARD_BANNER = 'QZF READY 1 1.0.0 10000 5000 500'
const FLASH_SIZE = 32_256
const PAGE = 128
const STK_OK = 0x10
const STK_INSYNC = 0x14

export type FakeBoardOptions = {
  usbVendorId?: number
  usbProductId?: number
  /** Bannière envoyée à l'ouverture à 9600 bauds ; `null` : une carte sans le programme QuizzUp. */
  banner?: string | null
  /** La carte répond `COOL` (pause de démarrage) tant que `endCool()` n'est pas appelé. */
  cool?: boolean
  signature?: number[]
  /** Contenu initial de la flash (l'ancien programme). */
  flash?: Uint8Array
  /** Le chargeur ne répond jamais. */
  silentLoader?: boolean
  /** Altère un octet de la première page (autre que la page 0) écrite : la relecture doit le voir. */
  corruptFirstWrite?: boolean
}

const domError = (name: string) => Object.assign(new Error(name), { name })
const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0))

export function createFakeBoardPort(options: FakeBoardOptions = {}) {
  const banner = options.banner === undefined ? FAKE_BOARD_BANNER : options.banner
  const flash = new Uint8Array(FLASH_SIZE).fill(0xff)
  if (options.flash) {
    flash.set(options.flash)
  }
  let cool = options.cool ?? false
  let corrupt = options.corruptFirstWrite ?? false
  let out = 0
  let cause = 'CMD'
  let lost = false
  let isOpen = false
  let baud = 0
  let address = 0
  let rx: number[] = []
  let line = ''
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  let readableStream: ReadableStream<Uint8Array> | null = null
  let writableStream: WritableStream<Uint8Array> | null = null

  /** Octets que la page a envoyés au programme de la carte (9600 bauds), ligne par ligne. */
  const lines: string[] = []
  const opens: number[] = []
  const stats = { pagesWritten: 0, resets: 0 }

  /**
   * Sans `options.flash`, la carte est livrée avec le programme QuizzUp. Avec `options.flash`
   * (l'ancien programme), elle ne dit la bannière qu'une fois sa première page changée : une
   * restauration de la sauvegarde la fait donc taire de nouveau.
   */
  const oldPage = flash.slice(0, PAGE)
  const runsQuizzUpProgram = () =>
    options.flash === undefined ||
    flash.subarray(0, PAGE).some((byte, index) => byte !== oldPage[index])

  const emit = (data: Uint8Array) => {
    try {
      controller?.enqueue(data)
    } catch {
      // Flux déjà fermé ou en erreur.
    }
  }

  const programLine = (text: string) => {
    lines.push(text)
    if (text === 'F' && !cool) {
      out = 1
    } else if (text === 'F') {
      cause = 'LEASE'
    } else if (text === '0') {
      out = 0
    }
    emit(ascii(`S ${out} ${cool ? 'COOL' : out ? 'FIRE' : 'READY'} ${cause}\n`))
  }

  const reply = (...data: number[]) => emit(Uint8Array.from([STK_INSYNC, ...data, STK_OK]))

  const loader = (byte: number) => {
    rx.push(byte)
    const [cmd = 0] = rx
    const need =
      cmd === 0x55
        ? 4
        : cmd === 0x64
          ? rx.length < 3
            ? 99
            : 4 + ((rx[1]! << 8) | rx[2]!) + 1
          : cmd === 0x74
            ? 5
            : 2
    if (rx.length < need) {
      return
    }
    const command = rx.splice(0)
    if (options.silentLoader) {
      return
    }
    if (cmd === 0x55) {
      address = (command[1]! | (command[2]! << 8)) * 2
      reply()
    } else if (cmd === 0x64) {
      const length = (command[1]! << 8) | command[2]!
      flash.set(command.slice(4, 4 + length), address)
      if (corrupt && address >= PAGE) {
        corrupt = false
        flash[address] = (flash[address] ?? 0) ^ 0xff
      }
      stats.pagesWritten += 1
      reply()
    } else if (cmd === 0x74) {
      reply(...flash.slice(address, address + PAGE))
    } else if (cmd === 0x75) {
      reply(...(options.signature ?? [0x1e, 0x95, 0x0f]))
    } else {
      reply()
    }
  }

  const write = (chunk: Uint8Array) => {
    if (lost) {
      throw domError('NetworkError')
    }
    for (const byte of chunk) {
      if (baud === 115_200) {
        loader(byte)
      } else if (byte === 0x0a) {
        programLine(line)
        line = ''
      } else {
        line += String.fromCharCode(byte)
      }
    }
  }

  const port = {
    async open(settings: { baudRate: number }) {
      if (isOpen) {
        throw domError('InvalidStateError')
      }
      isOpen = true
      baud = settings.baudRate
      opens.push(baud)
      rx = []
      line = ''
      readableStream = new ReadableStream<Uint8Array>({
        start: (next) => {
          controller = next
        },
      })
      writableStream = new WritableStream<Uint8Array>({ write })
      if (baud !== 115_200) {
        // Ouvrir le port remet la carte à zéro : le programme repart, pause de démarrage comprise.
        stats.resets += 1
        out = 0
        cause = 'CMD'
        if (banner !== null && runsQuizzUpProgram()) {
          queueMicrotask(() => emit(ascii(`${banner}\n`)))
        }
      }
    },
    async close() {
      if (!lost && (readableStream?.locked || writableStream?.locked)) {
        throw domError('InvalidStateError')
      }
      isOpen = false
    },
    async setSignals() {
      if (!isOpen || lost) {
        throw domError('InvalidStateError')
      }
    },
    getInfo: () => ({
      usbVendorId: options.usbVendorId ?? 0x2341,
      usbProductId: options.usbProductId ?? 0x0043,
    }),
    get readable() {
      return isOpen && !lost ? readableStream : null
    },
    get writable() {
      return isOpen && !lost ? writableStream : null
    },
  }

  return {
    port: port as unknown as SmokeBoardPort,
    flash,
    lines,
    opens,
    stats,
    /** Lignes `F` reçues par le programme : tout ce qui allume la fumée. */
    fireLines: () => lines.filter((text) => text === 'F').length,
    isOutputOn: () => out === 1,
    endCool: () => {
      cool = false
    },
    /** Câble débranché : les flux échouent, `readable` et `writable` deviennent nuls. */
    unplug: () => {
      lost = true
      controller?.error(domError('NetworkError'))
    },
    /** Câble rebranché : le port peut de nouveau s'ouvrir. */
    replug: () => {
      lost = false
    },
    /** La carte redémarre en cours de partie : sa bannière arrive une seconde fois. */
    reboot: () => {
      if (banner !== null) {
        emit(
          ascii(`${banner}
`)
        )
      }
    },
  }
}
