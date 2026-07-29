import { setAuthenticatedSuperadmin } from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { pushMock } from '@frontend-tests/_helpers/routerMock'
import {
  deletedThemeFixture,
  listThemesServiceMock,
  mockListThemesFailure,
  mockListThemesSuccess,
  themesFixture,
} from '@frontend-tests/_helpers/themesServiceMock'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import type { Theme } from '@/types/theme'
import ThemesView from '@/views/ThemesView.vue'

resetFrontendMocksBeforeEach()

const themesToolbarStub = defineComponent({
  name: 'ThemesToolbar',
  props: {
    modelValue: { type: String, default: '' },
    statusFilter: { type: String, default: '' },
    modeFilter: { type: String, default: '' },
    scopeFilter: { type: String, default: '' },
    canShowDeletedStatus: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'update:statusFilter', 'update:modeFilter', 'update:scopeFilter'],
  setup(props, { emit }) {
    return () =>
      h(
        'section',
        {
          'data-test': 'themes-toolbar-stub',
          'data-can-show-deleted': String(props.canShowDeletedStatus),
        },
        [
          h('button', {
            type: 'button',
            'data-test': 'set-deleted-status',
            onClick: () => emit('update:statusFilter', '2'),
          }),
          h('button', {
            type: 'button',
            'data-test': 'set-search',
            onClick: () => emit('update:modelValue', 'culture'),
          }),
        ]
      )
  },
})

const themesTableStub = defineComponent({
  name: 'ThemesTable',
  props: {
    themes: { type: Array, default: () => [] },
    loading: Boolean,
    error: String,
  },
  emits: ['retry', 'open', 'updated', 'deleted', 'error'],
  setup(props, { emit }) {
    return () =>
      h('section', { 'data-test': 'themes-table-stub', 'data-error': props.error }, [
        h(
          'ul',
          { 'data-test': 'themes-list' },
          (props.themes as Theme[]).map((theme) =>
            h('li', { 'data-test': 'theme-row', 'data-theme-id': String(theme.id) }, theme.name)
          )
        ),
        h('button', { type: 'button', 'data-test': 'open-theme', onClick: () => emit('open', 3) }),
        h('button', {
          type: 'button',
          'data-test': 'updated-theme',
          onClick: () => emit('updated', { ...themesFixture[0], name: 'Renamed' }),
        }),
        h('button', {
          type: 'button',
          'data-test': 'deleted-theme',
          onClick: () => emit('deleted', 1),
        }),
        h('button', {
          type: 'button',
          'data-test': 'table-error',
          onClick: () => emit('error', 'forbidden'),
        }),
        h('button', { type: 'button', 'data-test': 'retry', onClick: () => emit('retry') }),
      ])
  },
})

async function mountThemesView() {
  setAuthenticatedSuperadmin()

  const wrapper = mountWithFrontendMocks(ThemesView, {
    global: {
      stubs: {
        themesToolbar: themesToolbarStub,
        themesTable: themesTableStub,
      },
    },
  })

  await flushPromises()
  await nextTick()

  return wrapper
}

function themeIds(wrapper: Awaited<ReturnType<typeof mountThemesView>>): string[] {
  return wrapper
    .findAll('[data-test="theme-row"]')
    .map((row) => row.attributes('data-theme-id') ?? '')
}

describe('views/ThemesView.vue', () => {
  it('loads themes from the server and renders them in the table', async () => {
    const wrapper = await mountThemesView()

    expect(listThemesServiceMock).toHaveBeenCalledTimes(1)
    expect(themeIds(wrapper)).toEqual(['1', '2', '3'])
  })

  it('gates the deleted-status option to superadmins', async () => {
    const wrapper = await mountThemesView()

    expect(
      wrapper.find('[data-test="themes-toolbar-stub"]').attributes('data-can-show-deleted')
    ).toBe('true')
  })

  it('reloads from the server with the deleted filter and shows soft-deleted themes', async () => {
    const wrapper = await mountThemesView()

    mockListThemesSuccess([deletedThemeFixture])

    await wrapper.find('[data-test="set-deleted-status"]').trigger('click')
    await flushPromises()
    await nextTick()

    // Le filtre statut est transmis au serveur (correctif « Supprimé »).
    expect(listThemesServiceMock).toHaveBeenLastCalledWith({
      search: undefined,
      status: '2',
      mode: undefined,
      scope: undefined,
    })
    expect(themeIds(wrapper)).toEqual([String(deletedThemeFixture.id)])
  })

  it('forwards the search filter to the server query', async () => {
    const wrapper = await mountThemesView()

    await wrapper.find('[data-test="set-search"]').trigger('click')
    await flushPromises()

    expect(listThemesServiceMock).toHaveBeenLastCalledWith({
      search: 'culture',
      status: undefined,
      mode: undefined,
      scope: undefined,
    })
  })

  it('shows a load error and retries', async () => {
    mockListThemesFailure('server_error')
    const wrapper = await mountThemesView()

    expect(wrapper.find('[data-test="themes-table-stub"]').attributes('data-error')).toBe(
      'server_error'
    )

    mockListThemesSuccess()
    await wrapper.find('[data-test="retry"]').trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.find('[data-test="themes-table-stub"]').attributes('data-error')).toBeUndefined()
    expect(themeIds(wrapper)).toEqual(['1', '2', '3'])
  })

  it('shows banners and updates the list from table events', async () => {
    const wrapper = await mountThemesView()

    await wrapper.find('[data-test="updated-theme"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('themeUpdated')

    await wrapper.find('[data-test="deleted-theme"]').trigger('click')
    await nextTick()

    expect(themeIds(wrapper)).not.toContain('1')
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('themeDeleted')
  })

  it('navigates to a theme detail from the table open event', async () => {
    const wrapper = await mountThemesView()

    await wrapper.find('[data-test="open-theme"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'themes-edit', params: { themeId: '3' } })
  })

  it('surfaces table action errors in a dismissible banner', async () => {
    const wrapper = await mountThemesView()

    await wrapper.find('[data-test="table-error"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('forbidden')
    expect(wrapper.find('[data-test="base-banner-dismiss"]').exists()).toBe(true)
  })
})
