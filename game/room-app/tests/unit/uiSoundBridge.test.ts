import type { GameEvent } from '@quizzup/game-engine'

import { createUiSoundBridge, uiSoundForEvent } from '@/audio/uiSoundBridge'

function event(type: string, payload: Record<string, unknown> = {}): GameEvent {
  return { type, at: 0, payload } as GameEvent
}

describe('sons d’interface', () => {
  it('associe les événements du moteur aux sons', () => {
    expect(uiSoundForEvent(event('buzzer_pressed'))).toBe('buzz')
    expect(uiSoundForEvent(event('answer_correct'))).toBe('correct')
    expect(uiSoundForEvent(event('answer_wrong'))).toBe('wrong')
    expect(uiSoundForEvent(event('blind_test_stage_started', { stage: 1 }))).toBeNull()
    expect(uiSoundForEvent(event('blind_test_stage_started', { stage: 2 }))).toBe('tierUp')
    expect(uiSoundForEvent(event('question_ended', { winnerIds: [] }))).toBe('lostForAll')
    expect(uiSoundForEvent(event('question_ended', { winnerIds: [2] }))).toBeNull()
    expect(uiSoundForEvent(event('round_ended'))).toBe('reveal')
    expect(uiSoundForEvent(event('game_started'))).toBeNull()
  })

  it('joue chaque son et ignore les échecs du lecteur', () => {
    const play = vi.fn((name: string) => {
      if (name === 'wrong') {
        throw new Error('AudioContext fermé')
      }
    })
    const bridge = createUiSoundBridge({ play })

    expect(() =>
      bridge.handleEvents([event('buzzer_pressed'), event('answer_wrong'), event('tick')])
    ).not.toThrow()
    expect(play.mock.calls.map(([name]) => name)).toEqual(['buzz', 'wrong'])
  })
})
