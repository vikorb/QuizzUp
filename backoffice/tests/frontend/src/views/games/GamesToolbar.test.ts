import { useI18n } from '@frontend-tests/_helpers/i18nMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { GAME_STATE_PENDING, GAME_STATES } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import GamesToolbar from '@/views/games/GamesToolbar.vue'

resetFrontendMocksBeforeEach()

function mountToolbar(props: Record<string, unknown> = {}) {
  return mountWithFrontendMocks(GamesToolbar, { props })
}

// Le gabarit de BaseToolBar est remplacé par un double : on lit les puces qu'on lui transmet.
function chipLabels(wrapper: ReturnType<typeof mountToolbar>): string[] {
  const attrs = wrapper.findComponent({ name: 'BaseToolBar' }).vm.$attrs as Record<string, unknown>
  const filters = (attrs.activeFilters ?? attrs['active-filters']) as Array<{ label: string }>

  return filters.map((filter) => filter.label)
}

describe('views/games/GamesToolbar.vue', () => {
  it('offers every shared game state plus "all states"', () => {
    // Sans compagnie : le premier select est la salle, le second l'état.
    const stateSelect = mountToolbar().findAll('select')[1]!
    const options = stateSelect.findAll('option').map((option) => option.attributes('value'))

    expect(options).toEqual(['', ...GAME_STATES])
  })

  it('emits the state filter and resets it', async () => {
    const wrapper = mountToolbar({ stateFilter: GAME_STATE_PENDING })

    await wrapper.findAll('select')[1]!.setValue(GAME_STATE_PENDING)
    await wrapper.get('[data-test="base-toolbar-reset"]').trigger('click')

    expect(wrapper.emitted('update:stateFilter')).toEqual([[GAME_STATE_PENDING], ['']])
  })

  it('disables the reset without an active filter', () => {
    const wrapper = mountToolbar()

    expect(wrapper.get('[data-test="base-toolbar-reset"]').attributes('disabled')).toBeDefined()
  })

  it('offers "all rooms" then the rooms of the company, and emits the chosen one', async () => {
    const wrapper = mountToolbar({
      roomOptions: [
        { label: 'Salle Néon', value: '10' },
        { label: 'Salle Laser', value: '11' },
      ],
    })
    const roomSelect = wrapper.findAll('select')[0]!

    expect(roomSelect.findAll('option').map((option) => option.attributes('value'))).toEqual([
      '',
      '10',
      '11',
    ])

    await roomSelect.setValue('11')

    expect(wrapper.emitted('update:roomFilter')).toEqual([['11']])
  })

  it('emits the first and last day of the period from date inputs', async () => {
    const wrapper = mountToolbar()
    const [from, to] = wrapper.findAll('input[type="date"]')

    await from!.setValue('2026-11-05')
    await to!.setValue('2026-11-07')

    expect(wrapper.emitted('update:from')).toEqual([['2026-11-05']])
    expect(wrapper.emitted('update:to')).toEqual([['2026-11-07']])
  })

  it('enables the reset for a room or a period filter and resets every filter', async () => {
    const wrapper = mountToolbar({ from: '2026-11-05' })

    expect(wrapper.get('[data-test="base-toolbar-reset"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('[data-test="base-toolbar-reset"]').trigger('click')

    expect(wrapper.emitted('update:stateFilter')).toEqual([['']])
    expect(wrapper.emitted('update:roomFilter')).toEqual([['']])
    expect(wrapper.emitted('update:from')).toEqual([['']])
    expect(wrapper.emitted('update:to')).toEqual([['']])
  })

  it('shows the period chips as localised dates, not as the raw input value', () => {
    const wrapper = mountToolbar({ from: '2026-11-05', to: '2026-11-07' })

    expect(chipLabels(wrapper)).toEqual([
      expect.stringMatching(/^games\.filters\.from 0?5\/11\/2026$/),
      expect.stringMatching(/^games\.filters\.to 0?7\/11\/2026$/),
    ])
  })

  it('follows the active locale for the period chips', () => {
    const { locale } = useI18n()

    locale.value = 'en'

    try {
      expect(chipLabels(mountToolbar({ from: '2026-11-05' }))).toEqual([
        'games.filters.from 11/5/26',
      ])
    } finally {
      locale.value = 'fr'
    }
  })

  it('shows the company selector only when asked', async () => {
    // Salle et état.
    expect(mountToolbar().findAll('[data-test="select-field"]')).toHaveLength(2)

    const wrapper = mountToolbar({
      showCompany: true,
      companyId: '1',
      companyOptions: [
        { label: 'Acme', value: '1' },
        { label: 'Beta', value: '2' },
      ],
    })

    expect(wrapper.findAll('[data-test="select-field"]')).toHaveLength(3)

    await wrapper.findAll('select')[0].setValue('2')

    expect(wrapper.emitted('update:companyId')).toEqual([['2']])
  })

  it('emits create from the primary button', async () => {
    const wrapper = mountToolbar()

    await wrapper.get('[data-test="base-toolbar-primary"]').trigger('click')

    expect(wrapper.emitted('create')).toHaveLength(1)
  })

  it('hides the launch button without a company', () => {
    expect(
      mountToolbar({ canCreate: false }).find('[data-test="base-toolbar-primary"]').exists()
    ).toBe(false)
  })
})
