import type { BuzzerButton, Desk } from '../types'
import { BUZZER_BUTTONS, DEFAULT_DESKS, isBuzzerButton, isDesk } from '../types'

/** Buzzer physique identifié par son pupitre et sa lettre. */
export type BuzzerSlot = { desk: Desk; button: BuzzerButton }

/**
 * Association touche physique → buzzer. La clé est `KeyboardEvent.code` (position physique de la
 * touche), jamais `KeyboardEvent.key` (caractère) : le mapping marche en AZERTY comme en QWERTY.
 */
export type BuzzerKeymap = Record<string, BuzzerSlot>

/**
 * Touches refusées comme buzzer : elles déclenchent des actions du navigateur ou du système
 * (quitter le plein écran, changer de fenêtre, menu…) ou servent de modificateurs.
 */
const FORBIDDEN_CODES = new Set([
  'Escape',
  'Tab',
  'CapsLock',
  'ContextMenu',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'AltLeft',
  'AltRight',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'Fn',
  'FnLock',
  'PrintScreen',
  'ScrollLock',
  'Pause',
  'NumLock',
  'BrowserBack',
  'BrowserForward',
  'BrowserHome',
  'BrowserRefresh',
  'BrowserSearch',
  'Power',
  'Sleep',
  'WakeUp',
])

export function isAllowedBuzzerCode(code: string): boolean {
  if (!code || code === 'Unidentified' || FORBIDDEN_CODES.has(code)) {
    return false
  }
  // F1 à F24 : aide, plein écran (F11), outils de développement (F12)…
  return !/^F\d{1,2}$/.test(code)
}

export function findSlot(keymap: BuzzerKeymap, code: string): BuzzerSlot | null {
  return Object.hasOwn(keymap, code) ? (keymap[code] ?? null) : null
}

export function findCode(keymap: BuzzerKeymap, desk: Desk, button: BuzzerButton): string | null {
  for (const [code, slot] of Object.entries(keymap)) {
    if (slot.desk === desk && slot.button === button) {
      return code
    }
  }
  return null
}

/** Tous les buzzers attendus, dans l'ordre de l'apprentissage : pupitre 1 A-D, puis pupitre 2… */
export function listSlots(desks: readonly Desk[] = DEFAULT_DESKS): BuzzerSlot[] {
  return desks.flatMap((desk) => BUZZER_BUTTONS.map((button) => ({ desk, button })))
}

export function missingSlots(
  keymap: BuzzerKeymap,
  desks: readonly Desk[] = DEFAULT_DESKS
): BuzzerSlot[] {
  return listSlots(desks).filter((slot) => findCode(keymap, slot.desk, slot.button) === null)
}

/**
 * Mapping de développement et de démonstration, sans buzzer branché : rangées 1-4, Q-R, A-F et
 * Z-V d'un clavier QWERTY (mêmes positions physiques sur un AZERTY), puis 5-8 et T-I pour les
 * pupitres 5 et 6. Par défaut les 4 pupitres d'une salle standard ; `desks` en choisit d'autres.
 */
export function createDefaultKeymap(desks: readonly Desk[] = DEFAULT_DESKS): BuzzerKeymap {
  const rows: Record<Desk, readonly string[]> = {
    1: ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
    2: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
    3: ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
    4: ['KeyZ', 'KeyX', 'KeyC', 'KeyV'],
    5: ['Digit5', 'Digit6', 'Digit7', 'Digit8'],
    6: ['KeyT', 'KeyY', 'KeyU', 'KeyI'],
  }
  const keymap: BuzzerKeymap = {}
  for (const desk of desks) {
    BUZZER_BUTTONS.forEach((button, buttonIndex) => {
      const code = rows[desk][buttonIndex]
      if (code) {
        keymap[code] = { desk, button }
      }
    })
  }
  return keymap
}

export type KeymapParseResult = { keymap: BuzzerKeymap; problems: string[] }

/**
 * Relit un mapping venu de la configuration de salle (JSON en base). Les entrées invalides,
 * interdites ou en double (deux touches pour le même buzzer) sont écartées et signalées.
 */
export function parseKeymap(input: unknown): KeymapParseResult {
  const keymap: BuzzerKeymap = {}
  const problems: string[] = []

  if (input === undefined || input === null) {
    return { keymap, problems }
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { keymap, problems: ['buzzers.keymap doit être un objet { code: { desk, button } }'] }
  }

  for (const [code, raw] of Object.entries(input as Record<string, unknown>)) {
    const slot = raw as Partial<Record<'desk' | 'button', unknown>> | null
    if (!slot || !isDesk(slot.desk) || !isBuzzerButton(slot.button)) {
      problems.push(`Touche ${code} : buzzer invalide`)
      continue
    }
    if (!isAllowedBuzzerCode(code)) {
      problems.push(`Touche ${code} : touche système interdite`)
      continue
    }
    const existing = findCode(keymap, slot.desk, slot.button)
    if (existing) {
      problems.push(
        `Buzzer ${slot.button} du pupitre ${slot.desk} associé deux fois (${existing}, ${code})`
      )
      continue
    }
    keymap[code] = { desk: slot.desk, button: slot.button }
  }

  return { keymap, problems }
}
