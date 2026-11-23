import { mount } from '@vue/test-utils'
import { h } from 'vue'

import WizardStage from '@/components/setup/WizardStage.vue'
import { createAppI18n, setCurrentLocale } from '@/plugins/i18n'

function mountStage(slots: Record<string, () => ReturnType<typeof h>> = {}) {
  setCurrentLocale('fr')
  return mount(WizardStage, {
    props: { step: 2, total: 5, quitTest: 'my-quit' },
    slots: { default: () => h('p', { 'data-test': 'content' }, 'Contenu'), ...slots },
    global: { plugins: [createAppI18n()] },
  })
}

const button = (label: string, test: string) => () => h('button', { 'data-test': test }, label)

describe('WizardStage', () => {
  it('range le repère d’étape et « Quitter » en haut, le contenu au milieu, les actions en bas', () => {
    const wrapper = mountStage()

    const top = wrapper.find('.wizard__top')
    expect(top.find('[data-test="wizard-progress"]').text()).toBe('Étape 2 sur 5')
    expect(top.find('[data-test="my-quit"]').text()).toBe('Quitter')
    expect(wrapper.find('.wizard__body [data-test="content"]').text()).toBe('Contenu')
    expect(wrapper.find('footer[data-test="wizard-bar"]').exists()).toBe(true)

    // Haut, milieu, bas : dans cet ordre dans le document.
    const order = ['.wizard__top', '.wizard__body', '.wizard__bar'].map((selector) =>
      Array.from(wrapper.element.children).indexOf(wrapper.find(selector).element)
    )
    expect(order).toEqual([0, 1, 2])
  })

  it('« Quitter » est un bouton ordinaire (pas le bouton principal)', () => {
    const wrapper = mountStage()

    expect(wrapper.find('[data-test="my-quit"]').classes()).not.toContain('ui-btn--primary')
  })

  it('indique l’étape par une barre de progression', () => {
    const bar = mountStage().find('[role="progressbar"]')

    expect(bar.attributes('aria-valuenow')).toBe('2')
    expect(bar.attributes('aria-valuemax')).toBe('5')
    expect(bar.attributes('aria-labelledby')).toBeTruthy()
    expect(bar.find('.wizard__fill').attributes('style')).toContain('width: 40%')
  })

  it('met Retour, l’action secondaire puis l’action principale dans cet ordre', () => {
    const wrapper = mountStage({
      back: button('Retour', 'back'),
      secondary: button('Passer', 'secondary'),
      primary: button('Continuer', 'primary'),
    })

    const bar = wrapper.find('[data-test="wizard-bar"]')
    expect(bar.findAll('button').map((item) => item.text())).toEqual([
      'Retour',
      'Passer',
      'Continuer',
    ])
    expect(bar.find('.wizard__zone--back [data-test="back"]').exists()).toBe(true)
    expect(bar.find('.wizard__zone--secondary [data-test="secondary"]').exists()).toBe(true)
    expect(bar.find('.wizard__zone--primary [data-test="primary"]').exists()).toBe(true)
  })

  it('garde les trois zones de la barre même quand elles sont vides', () => {
    const wrapper = mountStage({ primary: button('Continuer', 'primary') })

    const zones = wrapper.findAll('[data-test="wizard-bar"] .wizard__zone')
    expect(zones.map((zone) => zone.classes()[1])).toEqual([
      'wizard__zone--back',
      'wizard__zone--secondary',
      'wizard__zone--primary',
    ])
    expect(zones[0]!.text()).toBe('')
    expect(zones[1]!.text()).toBe('')
  })

  it('émet « quit » au clic sur Quitter', async () => {
    const wrapper = mountStage()

    expect(wrapper.emitted('quit')).toBeUndefined()
    await wrapper.find('[data-test="my-quit"]').trigger('click')

    expect(wrapper.emitted('quit')).toHaveLength(1)
  })
})
