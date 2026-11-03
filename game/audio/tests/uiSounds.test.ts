import { beforeEach, describe, expect, it } from 'vitest'
import {
  UI_SOUND_NAMES,
  UI_SOUND_PRESETS,
  UiSoundPlayer,
  WebAudioExtractPlayer,
  getUiSoundPreset,
  uiSoundDurationMs,
  type UiSoundName,
} from '../src/index'
import { FakeAudioContext } from './fakeAudioContext'

const LEAD = 0.005

let ctx: FakeAudioContext

function createPlayer(volume?: number) {
  return new UiSoundPlayer({ context: () => ctx.asAudioContext(), volume })
}

function noteFrequencies(name: UiSoundName): number[] {
  return getUiSoundPreset(name)?.notes.map((note) => note.freq) ?? []
}

beforeEach(() => {
  ctx = new FakeAudioContext()
  ctx.state = 'running'
})

describe('UI_SOUND_PRESETS', () => {
  it('décrit chaque son une seule fois', () => {
    expect(UI_SOUND_PRESETS.map((preset) => preset.name).sort()).toEqual([...UI_SOUND_NAMES].sort())
  })

  it.each(UI_SOUND_NAMES)('« %s » reste court (< 1,2 s) et bien formé', (name) => {
    const preset = getUiSoundPreset(name)
    expect(preset?.notes.length).toBeGreaterThan(0)
    expect(uiSoundDurationMs(name)).toBeLessThan(1200)
    for (const note of preset?.notes ?? []) {
      expect(note.freq).toBeGreaterThan(20)
      expect(note.durationMs).toBeGreaterThan(0)
      expect(note.atMs).toBeGreaterThanOrEqual(0)
      expect(note.gain).toBeGreaterThan(0)
      expect(note.gain).toBeLessThanOrEqual(1)
    }
  })

  it('bonne réponse = arpège montant', () => {
    const freqs = noteFrequencies('correct')
    expect(freqs.length).toBeGreaterThanOrEqual(3)
    expect([...freqs].sort((a, b) => a - b)).toEqual(freqs)
  })

  it('mauvaise réponse = deux notes descendantes', () => {
    const [first, second, ...rest] = noteFrequencies('wrong')
    expect(rest).toHaveLength(0)
    expect(second).toBeLessThan(first ?? 0)
  })

  it('le tic est le son le plus court', () => {
    const others = UI_SOUND_NAMES.filter((name) => name !== 'tick')
    for (const name of others)
      expect(uiSoundDurationMs('tick')).toBeLessThan(uiSoundDurationMs(name))
  })
})

describe('UiSoundPlayer', () => {
  it('planifie un oscillateur par note sur l’horloge audio', () => {
    ctx.currentTime = 3
    createPlayer().play('correct')

    const notes = getUiSoundPreset('correct')?.notes ?? []
    expect(ctx.oscillators).toHaveLength(notes.length)
    ctx.oscillators.forEach((oscillator, index) => {
      const note = notes[index]
      if (!note) throw new Error('note manquante')
      const start = 3 + LEAD + note.atMs / 1000
      expect(oscillator.type).toBe(note.wave)
      expect(oscillator.startCall?.when).toBeCloseTo(start)
      expect(oscillator.stopTime).toBeCloseTo(start + note.durationMs / 1000)
      expect(oscillator.frequency.events[0]).toEqual({ type: 'set', value: note.freq, time: start })
    })
  })

  it('applique une enveloppe attaque / extinction qui revient à 0', () => {
    createPlayer().play('tick')

    const note = getUiSoundPreset('tick')?.notes[0]
    const envelope = ctx.gains.find((gain) => gain.gain.events.length > 0)
    const events = envelope?.gain.events ?? []
    expect(events[0]).toEqual({ type: 'set', value: 0, time: LEAD })
    expect(events[1]?.value).toBe(note?.gain)
    expect(events.at(-1)?.value).toBe(0)
    expect(events.at(-1)?.time).toBeCloseTo(LEAD + (note?.durationMs ?? 0) / 1000)
  })

  it('fait un glissando quand la note a un slideTo', () => {
    createPlayer().play('tierUp')

    const slide = ctx.oscillators[0]?.frequency.events.find((e) => e.type === 'exponential')
    expect(slide?.value).toBe(getUiSoundPreset('tierUp')?.notes[0]?.slideTo)
  })

  it('passe par un gain général réglé sur le volume, réutilisé entre deux sons', () => {
    const player = createPlayer(0.4)
    player.play('buzz')
    player.play('tick')

    const masters = ctx.gains.filter((gain) => gain.connections.includes(ctx.destination))
    expect(masters).toHaveLength(1)
    expect(masters[0]?.gain.value).toBe(0.4)

    player.setVolume(2)
    expect(masters[0]?.gain.value).toBe(1)
  })

  it('libère les nœuds à la fin de chaque note', () => {
    createPlayer().play('wrong')
    ctx.advance(2)
    expect(ctx.oscillators.every((oscillator) => oscillator.disconnectCount === 1)).toBe(true)
  })

  it('reprend un contexte suspendu', () => {
    ctx.state = 'suspended'
    createPlayer().play('buzz')
    expect(ctx.resumeCalls).toBe(1)
  })

  it('partage l’AudioContext du lecteur d’extraits', async () => {
    ctx.state = 'suspended'
    const extracts = new WebAudioExtractPlayer({ createContext: () => ctx.asAudioContext() })
    await extracts.unlock()

    UiSoundPlayer.sharing(extracts, { volume: 0.5 }).play('reveal')

    expect(ctx.oscillators.length).toBe(getUiSoundPreset('reveal')?.notes.length)
    expect(ctx.resumeCalls).toBe(1)
  })

  it('recrée le gain général si le contexte fourni change', () => {
    const first = ctx
    const second = new FakeAudioContext()
    let current = first
    const player = new UiSoundPlayer({ context: () => current.asAudioContext() })

    player.play('tick')
    current = second
    player.play('tick')

    expect(first.gains.some((gain) => gain.connections.includes(first.destination))).toBe(true)
    expect(second.gains.some((gain) => gain.connections.includes(second.destination))).toBe(true)
  })
})
