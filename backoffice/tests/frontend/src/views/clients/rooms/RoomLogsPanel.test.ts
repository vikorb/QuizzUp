import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  createRoomLogFixture,
  loadRoomLogsServiceMock,
  mockLoadRoomLogsFailure,
  mockLoadRoomLogsSuccess,
  roomLogsFixture,
  type RoomLogsResult,
  roomsFixture,
} from '@frontend-tests/_helpers/roomsServiceMock'
import {
  ROOM_LOG_LEVEL_ERROR,
  ROOM_LOG_LEVEL_WARN,
  ROOM_LOG_LIST_DEFAULT_LIMIT,
  ROOM_LOG_MESSAGE_MAX_LENGTH,
} from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RoomLogsPanel from '@/views/clients/rooms/RoomLogsPanel.vue'

resetFrontendMocksBeforeEach()

type Wrapper = ReturnType<typeof mountWithFrontendMocks>

async function mountPanel(room = roomsFixture[0]): Promise<Wrapper> {
  const wrapper = mountWithFrontendMocks(RoomLogsPanel, {
    props: { companyId: 1, room },
  })

  await flushPromises()

  return wrapper
}

function card(wrapper: Wrapper) {
  return wrapper.find('[data-test="base-card"]')
}

/** Réponse du service qu'un test résout à la main. */
function deferredLogs() {
  let resolve!: (value: RoomLogsResult) => void
  const promise = new Promise<RoomLogsResult>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

/** Une page pleine, du plus récent (`firstId`) au plus ancien. */
function fullPage(firstId: number) {
  return Array.from({ length: ROOM_LOG_LIST_DEFAULT_LIMIT }, (_item, index) =>
    createRoomLogFixture({ id: firstId - index })
  )
}

describe('views/clients/rooms/RoomLogsPanel.vue', () => {
  it('shows the loading state while the logs are being fetched', async () => {
    const pending = deferredLogs()

    loadRoomLogsServiceMock.mockReturnValue(pending.promise)

    const wrapper = await mountPanel()

    expect(card(wrapper).attributes('data-loading')).toBe('true')
    expect(wrapper.find('[data-test="base-card-loading"]').text()).toBe('rooms.logs.loading')

    pending.resolve({ ok: true, data: { logs: roomLogsFixture } })
    await flushPromises()

    expect(card(wrapper).attributes('data-loading')).toBe('false')
  })

  it('loads the logs of the room and lists them with level, code, message and context', async () => {
    const wrapper = await mountPanel()

    expect(loadRoomLogsServiceMock).toHaveBeenCalledWith(1, 1, {
      level: undefined,
      before: undefined,
    })
    expect(card(wrapper).attributes('data-title')).toBe('rooms.logs.title')

    const items = wrapper.findAll('.room-logs__item')

    expect(items).toHaveLength(2)
    expect(items[0]?.attributes('data-level')).toBe(ROOM_LOG_LEVEL_ERROR)
    expect(items[0]?.text()).toContain('rooms.logs.levels.error')
    expect(items[0]?.text()).toContain('dmx_output_error')
    expect(items[0]?.text()).toContain('Sortie DMX indisponible')
    expect(items[0]?.text()).toContain('rooms.logs.occurrences')
    expect(items[0]?.text()).toContain('usb')
    expect(items[0]?.text()).toContain('rooms.logs.context.desk')
    expect(items[1]?.attributes('data-level')).toBe(ROOM_LOG_LEVEL_WARN)
    expect(items[1]?.text()).not.toContain('rooms.logs.occurrences')
    expect(items[1]?.text()).not.toContain('rooms.logs.context.driver')
    expect(wrapper.find('.room-logs__more-btn').exists()).toBe(false)
  })

  it('shows a log message as plain text, never as HTML, and cuts a long one', async () => {
    mockLoadRoomLogsSuccess([
      createRoomLogFixture({ id: 5, message: '<b>gras</b><img src=x onerror=alert(1)>' }),
      createRoomLogFixture({ id: 4, message: 'a'.repeat(ROOM_LOG_MESSAGE_MAX_LENGTH + 100) }),
    ])

    const wrapper = await mountPanel()
    const messages = wrapper.findAll('.room-logs__message')

    expect(wrapper.find('.room-logs__message b').exists()).toBe(false)
    expect(wrapper.find('.room-logs__message img').exists()).toBe(false)
    expect(messages[0]?.text()).toBe('<b>gras</b><img src=x onerror=alert(1)>')
    expect(messages[1]?.text()).toHaveLength(ROOM_LOG_MESSAGE_MAX_LENGTH)
  })

  it('shows the empty state when the room reported nothing', async () => {
    mockLoadRoomLogsSuccess([])

    const wrapper = await mountPanel()

    expect(card(wrapper).attributes('data-empty')).toBe('true')
    expect(wrapper.find('[data-test="base-card-empty"]').text()).toBe('rooms.logs.empty')
    expect(wrapper.find('.room-logs__item').exists()).toBe(false)
  })

  it('shows the load error and retries', async () => {
    mockLoadRoomLogsFailure('forbidden')

    const wrapper = await mountPanel()

    expect(wrapper.find('.room-logs__error').text()).toBe('rooms.logs.errors.forbidden')
    // En erreur, « Réessayer » remplace l'icône d'actualisation.
    expect(wrapper.find('.room-logs__refresh').exists()).toBe(false)

    mockLoadRoomLogsSuccess()
    await wrapper.find('[data-test="base-card-actions"] [data-test="ui-button"]').trigger('click')
    await flushPromises()

    expect(loadRoomLogsServiceMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.room-logs__error').exists()).toBe(false)
    expect(wrapper.find('.room-logs__refresh').exists()).toBe(true)
    expect(wrapper.findAll('.room-logs__item')).toHaveLength(2)
  })

  it.each([
    ['not_found', 'rooms.logs.errors.notFound'],
    ['server_error', 'rooms.logs.errors.serverError'],
    ['invalid_query', 'rooms.logs.errors.default'],
    ['invalid_params', 'rooms.logs.errors.default'],
  ])('shows the logs-specific message for the %s code at load', async (code, key) => {
    mockLoadRoomLogsFailure(code)

    const wrapper = await mountPanel()

    expect(wrapper.find('.room-logs__error').text()).toBe(key)
    expect(wrapper.find('.room-logs__item').exists()).toBe(false)
  })

  it('reloads from the first page with the chosen level', async () => {
    const wrapper = await mountPanel()

    mockLoadRoomLogsSuccess([roomLogsFixture[1]])
    await wrapper.find('select').setValue(ROOM_LOG_LEVEL_WARN)
    await flushPromises()

    expect(loadRoomLogsServiceMock).toHaveBeenLastCalledWith(1, 1, {
      level: ROOM_LOG_LEVEL_WARN,
      before: undefined,
    })
    expect(wrapper.findAll('.room-logs__item')).toHaveLength(1)

    await wrapper.find('select').setValue('all')
    await flushPromises()

    expect(loadRoomLogsServiceMock).toHaveBeenLastCalledWith(1, 1, {
      level: undefined,
      before: undefined,
    })
  })

  it('keeps the filter usable when it leaves no log', async () => {
    const wrapper = await mountPanel()

    mockLoadRoomLogsSuccess([])
    await wrapper.find('select').setValue(ROOM_LOG_LEVEL_WARN)
    await flushPromises()

    expect(card(wrapper).attributes('data-empty')).toBe('true')
    expect(wrapper.find('select').exists()).toBe(true)
  })

  it('loads the next page after the oldest log already shown and appends it', async () => {
    mockLoadRoomLogsSuccess(fullPage(300))

    const wrapper = await mountPanel()

    expect(wrapper.findAll('.room-logs__item')).toHaveLength(ROOM_LOG_LIST_DEFAULT_LIMIT)

    mockLoadRoomLogsSuccess([createRoomLogFixture({ id: 150, code: 'older_entry' })])
    await wrapper.find('.room-logs__more-btn').trigger('click')
    await flushPromises()

    expect(loadRoomLogsServiceMock).toHaveBeenLastCalledWith(1, 1, {
      level: undefined,
      before: 300 - ROOM_LOG_LIST_DEFAULT_LIMIT + 1,
    })
    expect(wrapper.findAll('.room-logs__item')).toHaveLength(ROOM_LOG_LIST_DEFAULT_LIMIT + 1)
    expect(wrapper.text()).toContain('older_entry')
    // Page courte : c'était la dernière.
    expect(wrapper.find('.room-logs__more-btn').exists()).toBe(false)
  })

  it('keeps the logs already read when loading more fails', async () => {
    mockLoadRoomLogsSuccess(fullPage(300))

    const wrapper = await mountPanel()

    mockLoadRoomLogsFailure('api_unreachable')
    await wrapper.find('.room-logs__more-btn').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.room-logs__item')).toHaveLength(ROOM_LOG_LIST_DEFAULT_LIMIT)
    expect(wrapper.find('.room-logs__more-error').text()).toBe('rooms.logs.errors.apiUnreachable')
    expect(wrapper.find('.room-logs__error').exists()).toBe(false)
    expect(wrapper.find('.room-logs__more-btn').exists()).toBe(true)
  })

  it('shows the logs-specific message when the room is not found while loading more', async () => {
    mockLoadRoomLogsSuccess(fullPage(300))

    const wrapper = await mountPanel()

    mockLoadRoomLogsFailure('not_found')
    await wrapper.find('.room-logs__more-btn').trigger('click')
    await flushPromises()

    expect(wrapper.find('.room-logs__more-error').text()).toBe('rooms.logs.errors.notFound')
    expect(wrapper.findAll('.room-logs__item')).toHaveLength(ROOM_LOG_LIST_DEFAULT_LIMIT)
  })

  it('ignores a slow "load more" answer once the filter has changed', async () => {
    mockLoadRoomLogsSuccess(fullPage(300))

    const wrapper = await mountPanel()
    const slow = deferredLogs()

    loadRoomLogsServiceMock.mockReturnValueOnce(slow.promise)
    await wrapper.find('.room-logs__more-btn').trigger('click')

    mockLoadRoomLogsSuccess([createRoomLogFixture({ id: 2, code: 'filtered_result' })])
    await wrapper.find('select').setValue(ROOM_LOG_LEVEL_WARN)
    await flushPromises()

    slow.resolve({
      ok: true,
      data: { logs: [createRoomLogFixture({ id: 1, code: 'late_page_result' })] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('filtered_result')
    expect(wrapper.text()).not.toContain('late_page_result')
    expect(wrapper.findAll('.room-logs__item')).toHaveLength(1)
  })

  it('refreshes from the first page', async () => {
    const wrapper = await mountPanel()

    mockLoadRoomLogsSuccess([createRoomLogFixture({ id: 99, code: 'fresh_entry' })])
    await wrapper.find('.room-logs__refresh').trigger('click')
    await flushPromises()

    expect(loadRoomLogsServiceMock).toHaveBeenCalledTimes(2)
    expect(loadRoomLogsServiceMock).toHaveBeenLastCalledWith(1, 1, {
      level: undefined,
      before: undefined,
    })
    expect(wrapper.text()).toContain('fresh_entry')
    expect(wrapper.text()).not.toContain('gamepad_lost')
  })

  it('ignores a slow answer that arrives after a newer request', async () => {
    const slow = deferredLogs()

    loadRoomLogsServiceMock.mockReturnValueOnce(slow.promise)

    const wrapper = mountWithFrontendMocks(RoomLogsPanel, {
      props: { companyId: 1, room: roomsFixture[0] },
    })

    mockLoadRoomLogsSuccess([createRoomLogFixture({ id: 2, code: 'recent_filter_result' })])
    await wrapper.find('select').setValue(ROOM_LOG_LEVEL_ERROR)
    await flushPromises()

    slow.resolve({
      ok: true,
      data: { logs: [createRoomLogFixture({ id: 1, code: 'stale_result' })] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('recent_filter_result')
    expect(wrapper.text()).not.toContain('stale_result')
  })

  it('emits close from the close button', async () => {
    const wrapper = await mountPanel()

    await wrapper.find('.room-logs__close').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('reloads the logs when another room is selected', async () => {
    const wrapper = await mountPanel()

    await wrapper.setProps({ room: roomsFixture[1] })
    await flushPromises()

    expect(loadRoomLogsServiceMock).toHaveBeenLastCalledWith(1, 2, {
      level: undefined,
      before: undefined,
    })
  })
})
