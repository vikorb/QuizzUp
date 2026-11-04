import type { BuzzerKeymap } from '../buzzers/keymap'
import type { FixtureConfig, PanTilt } from '../dmx/fixtures'
import type { FixtureProfile } from '../dmx/profiles'
import { defaultColorWheelSlots } from '../dmx/profiles'
import type { BuzzerButton, Desk } from '../types'
import { BUZZER_BUTTONS, DESKS, isDesk } from '../types'

/**
 * Salle « 6 pupitres » déjà équipée, telle qu'on la trouve chez les centres qui ont un autre
 * système de quiz : 6 pupitres × 4 buzzers lumineux câblés sur une carte d'entrées USB, 8 lyres
 * en 9 canaux (2 wash + 6 spots), un décodeur LED 8 sorties RGB et une machine à fumée.
 *
 * Ce module ne contient que des **valeurs d'installation** (adresses, canaux, touches) relevées
 * dans les procédures fournies aux centres : il permet de brancher QuizzUp sur le matériel en
 * place sans rien recâbler. Analyse complète : rapport de compatibilité dans `docs/compatibilite/`.
 */

/** Couleur des buzzers d'un pupitre dans ces salles, dans l'ordre A, B, C, D. */
export const SIX_DESK_BUTTON_COLORS: Readonly<Record<BuzzerButton, string>> = {
  A: 'bleu',
  B: 'jaune',
  C: 'vert',
  D: 'rouge',
}

/**
 * Touches envoyées par le logiciel de conversion manette → clavier installé dans ces salles,
 * en position physique (`KeyboardEvent.code`). Sur un clavier AZERTY, le pupitre 1 correspond aux
 * lettres a z e r, le pupitre 2 à t y u i, le 3 à q s d f, le 4 à g h j k, le 5 à w x c v et le 6
 * à b n l m. Inutile si les buzzers sont lus directement en manette (`createGamepadBuzzerInput`).
 */
const SIX_DESK_KEY_ROWS: Readonly<Record<Desk, readonly string[]>> = {
  1: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
  2: ['KeyT', 'KeyY', 'KeyU', 'KeyI'],
  3: ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
  4: ['KeyG', 'KeyH', 'KeyJ', 'KeyK'],
  5: ['KeyZ', 'KeyX', 'KeyC', 'KeyV'],
  6: ['KeyB', 'KeyN', 'KeyL', 'Semicolon'],
}

export function createSixDeskKeyboardKeymap(): BuzzerKeymap {
  const keymap: BuzzerKeymap = {}
  for (const desk of DESKS) {
    BUZZER_BUTTONS.forEach((button, index) => {
      const code = SIX_DESK_KEY_ROWS[desk][index]
      if (code) {
        keymap[code] = { desk, button }
      }
    })
  }
  return keymap
}

/**
 * Lyres en mode 9 canaux (réglage « CH9 » dans le menu de chaque lyre). L'ordre des canaux suit
 * la disposition la plus courante de ces modèles génériques ; **à vérifier sur la notice** de la
 * lyre installée, puis corriger le profil dans la configuration de salle si besoin.
 */
export const SIX_DESK_PROFILES: readonly FixtureProfile[] = [
  {
    id: 'six-desk-spot-9',
    name: 'Lyre spot 9 canaux (roue de couleurs, à vérifier)',
    kind: 'movingHead',
    channels: [
      { role: 'pan' },
      { role: 'tilt' },
      // Roue de couleurs : le spot prend la couleur du pupitre (emplacements indicatifs, à régler).
      { role: 'colorWheel', slots: defaultColorWheelSlots() },
      { role: 'fixed', value: 0 }, // gobo : ouvert
      { role: 'strobe' },
      { role: 'dimmer' },
      { role: 'fixed', value: 0 }, // vitesse pan/tilt : maximale
      { role: 'fixed', value: 0 }, // programmes automatiques : désactivés
      { role: 'fixed', value: 0 }, // reset : aucun
    ],
  },
  {
    id: 'six-desk-wash-9',
    name: 'Lyre wash RGBW 9 canaux (à vérifier)',
    kind: 'movingHead',
    channels: [
      { role: 'pan' },
      { role: 'tilt' },
      { role: 'dimmer' },
      { role: 'red' },
      { role: 'green' },
      { role: 'blue' },
      { role: 'white' },
      { role: 'strobe' },
      { role: 'fixed', value: 0 }, // vitesse pan/tilt : maximale
    ],
  },
]

/** Adresses DMX de ces salles (procédure de configuration des lumières). */
export const SIX_DESK_ADDRESSES = {
  /** Lyre wash 1, au pied des pupitres à droite (vue depuis l'écran : à droite). */
  washRight: 1,
  /** Lyre spot qui éclaire le pupitre `desk` : 10 pour le pupitre 6 … 55 pour le pupitre 1. */
  spot: (desk: Desk) => 10 + 9 * (6 - desk),
  /** Lyre wash 2, au pied des pupitres à gauche. */
  washLeft: 64,
  /** Décodeur LED (DIP-switch sur 128) : sortie n = pupitre n, sortie 7 = ambiance. */
  ledDecoder: 128,
} as const

export type PanTiltCalibration = {
  /** Position de la lyre spot de chaque pupitre. */
  desks: Partial<Record<Desk, PanTilt>>
  /** Position des lyres wash : 1 = droite, 2 = gauche. */
  heads: Partial<Record<1 | 2, PanTilt>>
  problems: string[]
}

const BYTE_TO_WORD = 257

/**
 * Reprend les positions déjà réglées dans la salle (lignes `Pupitre1:150-77;` et `Head1:…;` du
 * fichier de configuration de session de l'ancien système, valeurs pan-tilt sur 0-255) pour ne
 * pas refaire le calage des lyres. Les autres lignes du fichier sont ignorées.
 */
export function parsePanTiltCalibration(text: string): PanTiltCalibration {
  const calibration: PanTiltCalibration = { desks: {}, heads: {}, problems: [] }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    const match = /^(pupitre|head)\s*(\d+)\s*:\s*(\d+)\s*-\s*(\d+)\s*;?$/i.exec(line)
    if (!match) {
      continue
    }
    const [, kind = '', rawNumber = '', rawPan = '', rawTilt = ''] = match
    const number = Number(rawNumber)
    const pan = Number(rawPan)
    const tilt = Number(rawTilt)
    if (pan > 255 || tilt > 255) {
      calibration.problems.push(`${line} : pan et tilt doivent être entre 0 et 255`)
      continue
    }
    const position = { pan: pan * BYTE_TO_WORD, tilt: tilt * BYTE_TO_WORD }
    if (kind.toLowerCase() === 'pupitre') {
      if (isDesk(number)) {
        calibration.desks[number] = position
      } else {
        calibration.problems.push(`${line} : pupitre inconnu`)
      }
    } else if (number === 1 || number === 2) {
      calibration.heads[number] = position
    } else {
      calibration.problems.push(`${line} : lyre wash inconnue (Head1 ou Head2)`)
    }
  }
  return calibration
}

export type SixDeskRigOptions = {
  /** Positions reprises de l'ancien système (`parsePanTiltCalibration`). */
  calibration?: Pick<PanTiltCalibration, 'desks' | 'heads'>
  /**
   * Adresse d'un relais DMX branché sur la télécommande de la machine à fumée. Sans relais
   * (montage d'origine sur minuterie autonome), la fumée n'est pas pilotée par le jeu.
   */
  smokeRelayAddress?: number
}

const withHome = (position: PanTilt | undefined) => (position ? { homePosition: position } : {})

export type SixDeskRig = { fixtures: FixtureConfig[]; customProfiles: FixtureProfile[] }

/**
 * Appareils d'une salle 6 pupitres, sur **un seul univers DMX** : les lyres occupent 1-72, le
 * décodeur LED 128-148 (aucun chevauchement). Une interface USB DMX unique remplace donc le
 * boîtier Art-Net à 2 sorties, en chaînant le décodeur LED et les lyres sur la même ligne.
 */
export function createSixDeskRoomRig(options: SixDeskRigOptions = {}): SixDeskRig {
  const desks = options.calibration?.desks ?? {}
  const heads = options.calibration?.heads ?? {}

  const fixtures: FixtureConfig[] = [
    {
      id: 'wash-droite',
      name: 'Lyre wash droite',
      profileId: 'six-desk-wash-9',
      address: SIX_DESK_ADDRESSES.washRight,
      ...withHome(heads[1]),
    },
  ]

  for (const desk of [...DESKS].reverse()) {
    const position = desks[desk]
    fixtures.push({
      id: `spot-pupitre-${desk}`,
      name: `Lyre spot pupitre ${desk}`,
      profileId: 'six-desk-spot-9',
      address: SIX_DESK_ADDRESSES.spot(desk),
      desk,
      ...(position ? { deskPositions: { [desk]: position }, homePosition: position } : {}),
    })
  }

  fixtures.push({
    id: 'wash-gauche',
    name: 'Lyre wash gauche',
    profileId: 'six-desk-wash-9',
    address: SIX_DESK_ADDRESSES.washLeft,
    ...withHome(heads[2]),
  })

  for (const desk of DESKS) {
    fixtures.push({
      id: `led-pupitre-${desk}`,
      name: `Ruban LED pupitre ${desk}`,
      profileId: 'par-rgb',
      address: SIX_DESK_ADDRESSES.ledDecoder + 3 * (desk - 1),
      desk,
    })
  }
  fixtures.push({
    id: 'led-ambiance',
    name: 'Ruban LED ambiance',
    profileId: 'par-rgb',
    address: SIX_DESK_ADDRESSES.ledDecoder + 3 * 6,
  })

  if (options.smokeRelayAddress !== undefined) {
    fixtures.push({
      id: 'fumee',
      name: 'Machine à fumée (relais DMX)',
      profileId: 'smoke-relay',
      address: options.smokeRelayAddress,
    })
  }

  return { fixtures, customProfiles: SIX_DESK_PROFILES.map((profile) => structuredClone(profile)) }
}
