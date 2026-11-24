import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

import { useTweenedNumber } from '@/composables/useTweenedNumber'

import { installFakeAnimationFrames, stubReducedMotion } from '../_helpers/animation'

const Harness = defineComponent({
  props: { value: { type: Number, required: true }, from: { type: Number, default: undefined } },
  setup(props) {
    const shown = useTweenedNumber(() => props.value, { from: props.from })
    return () => h('span', String(shown.value))
  },
})

describe('useTweenedNumber', () => {
  let frames: ReturnType<typeof installFakeAnimationFrames>

  beforeEach(() => {
    stubReducedMotion(false)
    frames = installFakeAnimationFrames()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('affiche d’emblée la valeur, sans demander d’image', () => {
    const wrapper = mount(Harness, { props: { value: 120 } })

    expect(wrapper.text()).toBe('120')
    expect(frames.request).not.toHaveBeenCalled()
  })

  it('monte vers la nouvelle valeur en 400 ms puis arrête la boucle', async () => {
    const wrapper = mount(Harness, { props: { value: 100 } })

    await wrapper.setProps({ value: 300 })
    frames.tick(1000)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe('100')
    frames.tick(1200)
    await wrapper.vm.$nextTick()
    const middle = Number(wrapper.text())
    expect(middle).toBeGreaterThan(100)
    expect(middle).toBeLessThan(300)

    frames.tick(1400)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe('300')
    expect(frames.pending).toBe(0)
  })

  it('annule l’image en cours quand la cible change en route, puis affiche la valeur finale', async () => {
    const wrapper = mount(Harness, { props: { value: 0 } })
    await wrapper.setProps({ value: 100 })
    frames.tick(0)
    frames.tick(200)
    await wrapper.vm.$nextTick()
    expect(Number(wrapper.text())).toBeGreaterThan(0)

    await wrapper.setProps({ value: 0 })

    expect(frames.cancel).toHaveBeenCalledTimes(1)
    expect(frames.pending).toBe(1)
    frames.tick(1000)
    frames.tick(1400)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe('0')
    expect(frames.pending).toBe(0)
  })

  it('annule la dernière image demandée au démontage', async () => {
    const wrapper = mount(Harness, { props: { value: 0 } })
    await wrapper.setProps({ value: 50 })
    expect(frames.pending).toBe(1)

    wrapper.unmount()

    expect(frames.pending).toBe(0)
    expect(frames.cancel).toHaveBeenCalled()
  })

  it('avec `from`, monte depuis cette valeur dès le montage', async () => {
    const wrapper = mount(Harness, { props: { value: 80, from: 0 } })

    expect(wrapper.text()).toBe('0')
    frames.tick(0)
    frames.tick(400)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe('80')
    expect(frames.pending).toBe(0)
  })

  describe('avec prefers-reduced-motion', () => {
    beforeEach(() => stubReducedMotion(true))

    it('saute directement à la valeur finale, sans image demandée', async () => {
      const wrapper = mount(Harness, { props: { value: 100 } })

      await wrapper.setProps({ value: 300 })

      expect(wrapper.text()).toBe('300')
      expect(frames.request).not.toHaveBeenCalled()
    })

    it('même avec `from`, affiche la valeur finale tout de suite', () => {
      const wrapper = mount(Harness, { props: { value: 80, from: 0 } })

      expect(wrapper.text()).toBe('80')
      expect(frames.request).not.toHaveBeenCalled()
    })
  })
})
