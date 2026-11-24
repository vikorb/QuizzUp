import { mount } from '@vue/test-utils'

import TimerBar from '@/components/game/TimerBar.vue'
import { getDemoThemes } from '@/game/demoContent'
import { createMemorySessionStorage } from '@/game/session'
import {
  closeGame,
  configureRoomGame,
  pauseGame,
  resumeGame,
  startNewGame,
} from '@/game/useRoomGame'

import { createManualClock, REGISTRATIONS } from '../_helpers/fixtures'

function mountBar(remainingMs?: number, tone?: 'default' | 'warn' | 'ok') {
  return mount(TimerBar, { props: { value: 0.5, remainingMs, tone } })
}

describe('TimerBar : compte à rebours', () => {
  const play = vi.fn()

  beforeEach(() => {
    play.mockClear()
    configureRoomGame({
      sounds: { play },
      storage: createMemorySessionStorage(),
      now: createManualClock().now,
    })
  })

  afterEach(() => closeGame())

  it('reste neutre et muet tant qu’il reste 3 s ou plus', async () => {
    const wrapper = mountBar(8000)

    expect(wrapper.classes()).toContain('timer--default')
    expect(wrapper.classes()).not.toContain('timer--urgent')
    await wrapper.setProps({ remainingMs: 4000 })
    await wrapper.setProps({ remainingMs: 3001 })
    expect(wrapper.classes()).toContain('timer--default')
    expect(play).not.toHaveBeenCalled()
  })

  it('passe à l’état warn sous 3 s, même si le ton demandé est neutre', async () => {
    const wrapper = mountBar(3500)

    await wrapper.setProps({ remainingMs: 2999 })

    expect(wrapper.classes()).toContain('timer--warn')
    expect(wrapper.classes()).toContain('timer--urgent')
  })

  it('sans remainingMs, garde le ton demandé et ne joue rien', async () => {
    const wrapper = mountBar(undefined, 'ok')

    await wrapper.setProps({ value: 0.1 })

    expect(wrapper.classes()).toContain('timer--ok')
    expect(play).not.toHaveBeenCalled()
  })

  it('joue un seul tick par seconde à 3, 2 et 1 s, puis plus rien à 0', async () => {
    const wrapper = mountBar(3600)

    // Le moteur avance par pas de 50 ms : plusieurs mises à jour par seconde.
    for (let ms = 3550; ms >= 0; ms -= 50) {
      await wrapper.setProps({ remainingMs: ms })
    }

    expect(play).toHaveBeenCalledTimes(3)
    expect(play.mock.calls.every(([name]) => name === 'tick')).toBe(true)
  })

  it('joue le tick de 3 s dès que le seuil est franchi, pas avant', async () => {
    const wrapper = mountBar(3200)

    await wrapper.setProps({ remainingMs: 3100 })
    expect(play).not.toHaveBeenCalled()
    // 3000 ms restantes : la 3e seconde est entamée.
    await wrapper.setProps({ remainingMs: 3000 })
    expect(play).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ remainingMs: 2950 })
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('silencieux : garde l’état warn et la pulsation, mais ne joue aucun tick', async () => {
    const wrapper = mount(TimerBar, { props: { value: 0.5, remainingMs: 3600, silent: true } })

    for (let ms = 3550; ms >= 0; ms -= 50) {
      await wrapper.setProps({ remainingMs: ms })
    }

    expect(wrapper.classes()).toContain('timer--warn')
    expect(wrapper.classes()).toContain('timer--urgent')
    expect(play).not.toHaveBeenCalled()
  })

  it('ne rejoue pas une seconde déjà jouée quand le temps se recule (nouveau palier)', async () => {
    const wrapper = mountBar(3500)
    await wrapper.setProps({ remainingMs: 2400 })
    expect(play).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ remainingMs: 9000 })
    expect(play).toHaveBeenCalledTimes(1)
  })

  describe('pendant une pause', () => {
    beforeEach(() => {
      startNewGame({ registrations: REGISTRATIONS, themes: getDemoThemes(), seed: 11 })
    })

    it('ne joue aucun tick, même si une seconde change', async () => {
      const wrapper = mountBar(3600)
      expect(pauseGame().ok).toBe(true)

      await wrapper.setProps({ remainingMs: 2900 })
      await wrapper.setProps({ remainingMs: 1900 })
      await wrapper.setProps({ remainingMs: 900 })

      expect(play).not.toHaveBeenCalled()
    })

    it('ne joue rien non plus quand l’horloge gelée ne bouge pas, ni à la reprise', async () => {
      const wrapper = mountBar(3500)
      await wrapper.setProps({ remainingMs: 2400 })
      expect(play).toHaveBeenCalledTimes(1)

      pauseGame()
      await wrapper.setProps({ remainingMs: 2400 })
      resumeGame()
      await wrapper.setProps({ remainingMs: 2400 })

      expect(play).toHaveBeenCalledTimes(1)
    })
  })
})
