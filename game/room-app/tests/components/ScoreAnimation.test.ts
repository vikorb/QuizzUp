import { mount } from '@vue/test-utils'

import Leaderboard from '@/components/game/Leaderboard.vue'
import ScoreBoard from '@/components/game/ScoreBoard.vue'
import type { LeaderboardLine } from '@/game/selectors'
import { createAppI18n } from '@/plugins/i18n'

import { installFakeAnimationFrames, stubReducedMotion } from '../_helpers/animation'

const line = (id: number, score: number, rank = id, roundPoints = 0): LeaderboardLine => ({
  participantId: id,
  podium: id,
  displayName: `Joueur ${id}`,
  score,
  rank,
  roundPoints,
})

function mountScoreBoard(lines: LeaderboardLine[]) {
  return mount(ScoreBoard, { props: { lines }, global: { plugins: [createAppI18n()] } })
}

function mountLeaderboard(lines: LeaderboardLine[], showRoundPoints = false) {
  return mount(Leaderboard, {
    props: { lines, showRoundPoints },
    global: { plugins: [createAppI18n()] },
  })
}

describe('scores animés', () => {
  let frames: ReturnType<typeof installFakeAnimationFrames>

  beforeEach(() => {
    stubReducedMotion(false)
    frames = installFakeAnimationFrames()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('tableau des scores : le score monte puis affiche la valeur exacte', async () => {
    const wrapper = mountScoreBoard([line(1, 100), line(2, 0)])
    expect(wrapper.findAll('.score__value').map((node) => node.text())).toEqual(['100', '0'])

    await wrapper.setProps({ lines: [line(1, 250), line(2, 0)] })
    frames.tick(0)
    frames.tick(200)
    await wrapper.vm.$nextTick()
    const middle = Number(wrapper.find('.score__value').text())
    expect(middle).toBeGreaterThan(100)
    expect(middle).toBeLessThan(250)

    frames.tick(400)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.score__value').text()).toBe('250')
    expect(frames.pending).toBe(0)
  })

  it('tableau des scores : plus aucune image en attente au démontage', async () => {
    const wrapper = mountScoreBoard([line(1, 0)])
    await wrapper.setProps({ lines: [line(1, 100)] })
    expect(frames.pending).toBe(1)

    wrapper.unmount()

    expect(frames.pending).toBe(0)
  })

  it('tableau des scores, mouvement réduit : saut direct', async () => {
    stubReducedMotion(true)
    const wrapper = mountScoreBoard([line(1, 100)])

    await wrapper.setProps({ lines: [line(1, 250)] })

    expect(wrapper.find('.score__value').text()).toBe('250')
    expect(frames.request).not.toHaveBeenCalled()
  })

  it('classement : les points montent depuis 0 jusqu’au score final', async () => {
    const wrapper = mountLeaderboard([line(1, 300), line(2, 100)])
    expect(wrapper.findAll('.board__score').map((node) => node.text())).toEqual(['0 pts', '0 pts'])

    frames.tick(0)
    frames.tick(400)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.board__score').map((node) => node.text())).toEqual([
      '300 pts',
      '100 pts',
    ])
    expect(frames.pending).toBe(0)
  })

  it('bilan de manche : les points montent depuis le score d’avant la manche', async () => {
    const wrapper = mountLeaderboard([line(1, 300, 1, 100), line(2, 100, 2, 0)], true)
    expect(wrapper.findAll('.board__score').map((node) => node.text())).toEqual([
      '200 pts',
      '100 pts',
    ])

    frames.tick(0)
    frames.tick(200)
    await wrapper.vm.$nextTick()
    const middle = Number(wrapper.find('.board__score').text().replace(/\D/g, ''))
    expect(middle).toBeGreaterThan(200)
    expect(middle).toBeLessThan(300)

    frames.tick(400)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.board__score').map((node) => node.text())).toEqual([
      '300 pts',
      '100 pts',
    ])
    expect(frames.pending).toBe(0)
  })

  it('classement, mouvement réduit : score final dès l’affichage', () => {
    stubReducedMotion(true)

    const wrapper = mountLeaderboard([line(1, 300)])

    expect(wrapper.find('.board__score').text()).toBe('300 pts')
    expect(frames.request).not.toHaveBeenCalled()
  })
})
