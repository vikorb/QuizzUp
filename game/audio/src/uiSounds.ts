/**
 * Sons d'interface de l'écran de salle, synthétisés par oscillateurs Web Audio : aucun fichier,
 * donc aucun souci de droits ni de chargement. Chaque son est une courte séquence de notes
 * décrite en données dans `UI_SOUND_PRESETS` : pour changer un son, on modifie le tableau.
 */

export const UI_SOUND_NAMES = [
  'buzz',
  'correct',
  'wrong',
  'lostForAll',
  'tick',
  'tierUp',
  'reveal',
] as const

export type UiSoundName = (typeof UI_SOUND_NAMES)[number]

/** Une note : démarre à `atMs` depuis le début du son et dure `durationMs`. */
export type UiNote = {
  atMs: number
  durationMs: number
  /** Fréquence de départ en Hz. */
  freq: number
  /** Glissando optionnel jusqu'à cette fréquence (Hz) à la fin de la note. */
  slideTo?: number
  wave: OscillatorType
  /** Niveau crête entre 0 et 1. */
  gain: number
  /** Enveloppe : montée et extinction en ms. */
  attackMs: number
  releaseMs: number
}

export type UiSoundPreset = { name: UiSoundName; notes: UiNote[] }

// Notes utiles (Hz).
const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const C6 = 1046.5
const A4 = 440
const A5 = 880

export const UI_SOUND_PRESETS: readonly UiSoundPreset[] = [
  {
    // Buzz franc : carré grave doublé d'une dent de scie à l'octave inférieure.
    name: 'buzz',
    notes: [
      {
        atMs: 0,
        durationMs: 380,
        freq: 196,
        wave: 'square',
        gain: 0.35,
        attackMs: 4,
        releaseMs: 60,
      },
      {
        atMs: 0,
        durationMs: 380,
        freq: 98,
        wave: 'sawtooth',
        gain: 0.3,
        attackMs: 4,
        releaseMs: 60,
      },
    ],
  },
  {
    // Bonne réponse : arpège majeur montant, dernière note tenue.
    name: 'correct',
    notes: [
      {
        atMs: 0,
        durationMs: 110,
        freq: C5,
        wave: 'triangle',
        gain: 0.45,
        attackMs: 5,
        releaseMs: 40,
      },
      {
        atMs: 90,
        durationMs: 110,
        freq: E5,
        wave: 'triangle',
        gain: 0.45,
        attackMs: 5,
        releaseMs: 40,
      },
      {
        atMs: 180,
        durationMs: 110,
        freq: G5,
        wave: 'triangle',
        gain: 0.45,
        attackMs: 5,
        releaseMs: 40,
      },
      {
        atMs: 270,
        durationMs: 380,
        freq: C6,
        wave: 'triangle',
        gain: 0.5,
        attackMs: 5,
        releaseMs: 200,
      },
    ],
  },
  {
    // Mauvaise réponse : deux notes descendantes.
    name: 'wrong',
    notes: [
      {
        atMs: 0,
        durationMs: 220,
        freq: 311.13,
        wave: 'square',
        gain: 0.25,
        attackMs: 5,
        releaseMs: 50,
      },
      {
        atMs: 240,
        durationMs: 380,
        freq: 233.08,
        wave: 'square',
        gain: 0.25,
        attackMs: 5,
        releaseMs: 150,
      },
    ],
  },
  {
    // Perdu pour tout le monde : « wah wah wah waaah » descendant.
    name: 'lostForAll',
    notes: [
      {
        atMs: 0,
        durationMs: 220,
        freq: 392,
        wave: 'sawtooth',
        gain: 0.22,
        attackMs: 10,
        releaseMs: 50,
      },
      {
        atMs: 250,
        durationMs: 220,
        freq: 369.99,
        wave: 'sawtooth',
        gain: 0.22,
        attackMs: 10,
        releaseMs: 50,
      },
      {
        atMs: 500,
        durationMs: 220,
        freq: 349.23,
        wave: 'sawtooth',
        gain: 0.22,
        attackMs: 10,
        releaseMs: 50,
      },
      {
        atMs: 750,
        durationMs: 420,
        freq: 329.63,
        slideTo: 293.66,
        wave: 'sawtooth',
        gain: 0.22,
        attackMs: 10,
        releaseMs: 180,
      },
    ],
  },
  {
    // Tic d'horloge : très court et aigu.
    name: 'tick',
    notes: [
      { atMs: 0, durationMs: 45, freq: 1200, wave: 'sine', gain: 0.3, attackMs: 1, releaseMs: 30 },
    ],
  },
  {
    // Passage au palier suivant : glissando montant puis petite confirmation.
    name: 'tierUp',
    notes: [
      {
        atMs: 0,
        durationMs: 180,
        freq: A4,
        slideTo: A5,
        wave: 'sine',
        gain: 0.4,
        attackMs: 5,
        releaseMs: 40,
      },
      {
        atMs: 190,
        durationMs: 140,
        freq: A5,
        wave: 'triangle',
        gain: 0.4,
        attackMs: 5,
        releaseMs: 80,
      },
    ],
  },
  {
    // Révélation de la réponse : accord scintillant qui s'ouvre.
    name: 'reveal',
    notes: [
      {
        atMs: 0,
        durationMs: 700,
        freq: C5,
        wave: 'sine',
        gain: 0.25,
        attackMs: 20,
        releaseMs: 400,
      },
      {
        atMs: 60,
        durationMs: 640,
        freq: E5,
        wave: 'sine',
        gain: 0.25,
        attackMs: 20,
        releaseMs: 400,
      },
      {
        atMs: 120,
        durationMs: 580,
        freq: G5,
        wave: 'sine',
        gain: 0.25,
        attackMs: 20,
        releaseMs: 400,
      },
      {
        atMs: 200,
        durationMs: 600,
        freq: C6,
        wave: 'triangle',
        gain: 0.2,
        attackMs: 20,
        releaseMs: 400,
      },
    ],
  },
]

export function getUiSoundPreset(name: UiSoundName): UiSoundPreset | undefined {
  return UI_SOUND_PRESETS.find((preset) => preset.name === name)
}

/** Durée totale d'un son en ms (fin de la dernière note). */
export function uiSoundDurationMs(name: UiSoundName): number {
  const notes = getUiSoundPreset(name)?.notes ?? []
  return notes.reduce((max, note) => Math.max(max, note.atMs + note.durationMs), 0)
}

export type UiSoundPlayerOptions = {
  /** Fournit l'AudioContext : passer `() => extractPlayer.getContext()` pour le partager. */
  context?: () => AudioContext
  /** Volume général entre 0 et 1 (défaut 0.8). */
  volume?: number
}

/** Petit décalage pour ne jamais planifier une note dans le passé de l'horloge audio. */
const SCHEDULE_LEAD_SEC = 0.005

export class UiSoundPlayer {
  private readonly getContext: () => AudioContext
  private volume: number
  private master: GainNode | null = null

  constructor(options: UiSoundPlayerOptions = {}) {
    let ownContext: AudioContext | null = null
    this.getContext = options.context ?? (() => (ownContext ??= new AudioContext()))
    this.volume = clampVolume(options.volume ?? 0.8, 0.8)
  }

  /** Crée un lecteur de sons qui partage l'AudioContext d'un lecteur d'extraits. */
  static sharing(
    player: { getContext(): AudioContext },
    options: Omit<UiSoundPlayerOptions, 'context'> = {}
  ): UiSoundPlayer {
    return new UiSoundPlayer({ ...options, context: () => player.getContext() })
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume, this.volume)
    if (this.master) this.master.gain.value = this.volume
  }

  /** Planifie toutes les notes du son sur l'horloge audio ; ne bloque pas. */
  play(name: UiSoundName): void {
    const preset = getUiSoundPreset(name)
    if (!preset) return
    const context = this.getContext()
    if (context.state === 'suspended') void context.resume().catch(() => undefined)
    const origin = context.currentTime + SCHEDULE_LEAD_SEC
    for (const note of preset.notes) this.scheduleNote(context, note, origin)
  }

  private scheduleNote(context: AudioContext, note: UiNote, origin: number): void {
    const start = origin + note.atMs / 1000
    const end = start + note.durationMs / 1000
    const oscillator = context.createOscillator()
    const envelope = context.createGain()

    oscillator.type = note.wave
    oscillator.frequency.setValueAtTime(note.freq, start)
    if (note.slideTo) oscillator.frequency.exponentialRampToValueAtTime(note.slideTo, end)
    applyEnvelope(envelope.gain, note, start, end)

    oscillator.connect(envelope)
    envelope.connect(this.output(context))
    oscillator.onended = () => {
      oscillator.disconnect()
      envelope.disconnect()
    }
    oscillator.start(start)
    oscillator.stop(end)
  }

  private output(context: AudioContext): GainNode {
    if (this.master && this.master.context === context) return this.master
    this.master = context.createGain()
    this.master.gain.value = this.volume
    this.master.connect(context.destination)
    return this.master
  }
}

function applyEnvelope(param: AudioParam, note: UiNote, start: number, end: number): void {
  const durationSec = end - start
  const attack = Math.min(note.attackMs / 1000, durationSec / 2)
  const release = Math.min(note.releaseMs / 1000, durationSec - attack)
  param.setValueAtTime(0, start)
  param.linearRampToValueAtTime(note.gain, start + attack)
  param.setValueAtTime(note.gain, end - release)
  param.linearRampToValueAtTime(0, end)
}

function clampVolume(volume: number, fallback: number): number {
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : fallback
}
