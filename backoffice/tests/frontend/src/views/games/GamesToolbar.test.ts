import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { GAME_STATE_PENDING, GAME_STATES } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import GamesToolbar from '@/views/games/GamesToolbar.vue'

resetFrontendMocksBeforeEach()

function mountToolbar(props: Record<string, unknown> = {}) {
  return mountWithFrontendMocks(GamesToolbar, { props })
}

describe('views/games/GamesToolbar.vue', () => {
  it('offers every shared game state plus "all states"', () => {
    const wrapper = mountToolbar()
    const options = wrapper.findAll('option').map((option) => option.attributes('value'))

    expect(options).toEqual(['', ...GAME_STATES])
  })

  it('emits the state filter and resets it', async () => {
    const wrapper = mountToolbar({ stateFilter: GAME_STATE_PENDING })

    await wrapper.get('select').setValue(GAME_STATE_PENDING)
    await wrapper.get('[data-test="base-toolbar-reset"]').trigger('click')

    expect(wrapper.emitted('update:stateFilter')).toEqual([[GAME_STATE_PENDING], ['']])
  })

  it('disables the reset without an active filter', () => {
    const wrapper = mountToolbar()

    expect(wrapper.get('[data-test="base-toolbar-reset"]').attributes('disabled')).toBeDefined()
  })

  it('shows the company selector only when asked', async () => {
    expect(mountToolbar().findAll('[data-test="select-field"]')).toHaveLength(1)

    const wrapper = mountToolbar({
      showCompany: true,
      companyId: '1',
      companyOptions: [
        { label: 'Acme', value: '1' },
        { label: 'Beta', value: '2' },
      ],
    })

    expect(wrapper.findAll('[data-test="select-field"]')).toHaveLength(2)

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
