import { enableAutoUnmount, mount } from '@vue/test-utils'

import Confetti from '@/components/game/Confetti.vue'
import type { LeaderboardLine } from '@/game/selectors'
import { createAppI18n } from '@/plugins/i18n'
import FinishedScreen from '@/views/game/FinishedScreen.vue'

import { installFakeAnimationFrames, stubReducedMotion } from '../_helpers/animation'

// Le canvas est téléporté dans `body` : sans démontage il survivrait au test suivant.
enableAutoUnmount(afterEach)

function fakeContext() {
  return {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
  }
}

const canvasInDocument = () => document.body.querySelector('canvas[data-test="confetti"]')

describe('Confetti', () => {
  let frames: ReturnType<typeof installFakeAnimationFrames>
  let context: ReturnType<typeof fakeContext>
  let getContext: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stubReducedMotion(false)
    frames = installFakeAnimationFrames()
    context = fakeContext()
    getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as never)
  })

  afterEach(() => {
    getContext.mockRestore()
    vi.unstubAllGlobals()
  })

  it('dessine 150 particules par image sur un seul canvas', () => {
    mount(Confetti, { attachTo: document.body })

    expect(document.body.querySelectorAll('canvas')).toHaveLength(1)
    frames.tick(0)
    expect(context.fillRect).toHaveBeenCalledTimes(150)
    frames.tick(16)
    expect(context.fillRect).toHaveBeenCalledTimes(300)
  })

  it('arrête la boucle et retire le canvas après 4 secondes', async () => {
    const wrapper = mount(Confetti, { attachTo: document.body })
    frames.tick(1000)
    frames.tick(4999)
    expect(canvasInDocument()).not.toBeNull()
    expect(frames.pending).toBe(1)

    frames.tick(5000)
    await wrapper.vm.$nextTick()

    expect(canvasInDocument()).toBeNull()
    expect(frames.pending).toBe(0)
    const requests = frames.request.mock.calls.length
    frames.tick(5016)
    expect(frames.request).toHaveBeenCalledTimes(requests)
  })

  it('annule l’image en attente au démontage', () => {
    const wrapper = mount(Confetti, { attachTo: document.body })
    frames.tick(0)
    expect(frames.pending).toBe(1)

    wrapper.unmount()

    expect(frames.pending).toBe(0)
    expect(canvasInDocument()).toBeNull()
  })

  it('avec prefers-reduced-motion, ne crée aucun canvas et ne lance aucune boucle', () => {
    stubReducedMotion(true)

    mount(Confetti, { attachTo: document.body })

    expect(canvasInDocument()).toBeNull()
    expect(getContext).not.toHaveBeenCalled()
    expect(frames.request).not.toHaveBeenCalled()
  })

  it('sans contexte 2D, retire le canvas sans boucle', async () => {
    getContext.mockReturnValue(null as never)

    const wrapper = mount(Confetti, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    expect(canvasInDocument()).toBeNull()
    expect(frames.request).not.toHaveBeenCalled()
  })
})

const line = (rank: number, score: number): LeaderboardLine => ({
  participantId: rank,
  podium: rank,
  displayName: `Joueur ${rank}`,
  score,
  rank,
  roundPoints: 0,
})

function mountPodium(lines: LeaderboardLine[], aborted = false) {
  return mount(FinishedScreen, {
    props: { lines, aborted, noContent: false },
    attachTo: document.body,
    global: { plugins: [createAppI18n()] },
  })
}

describe('podium : confettis', () => {
  beforeEach(() => {
    stubReducedMotion(false)
    installFakeAnimationFrames()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext() as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('lance les confettis quand quelqu’un a gagné', () => {
    mountPodium([line(1, 300), line(2, 100)])

    expect(canvasInDocument()).not.toBeNull()
  })

  it('n’en lance pas sur une partie arrêtée ni sans aucun point marqué', () => {
    mountPodium([line(1, 300)], true)
    expect(canvasInDocument()).toBeNull()

    mountPodium([line(1, 0), line(1, 0)])
    expect(canvasInDocument()).toBeNull()
  })
})
