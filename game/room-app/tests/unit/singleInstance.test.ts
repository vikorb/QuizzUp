import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import { createAppI18n, setCurrentLocale } from '@/plugins/i18n'
import { acquireSingleInstance, ROOM_LOCK_NAME } from '@/utils/singleInstance'
import AlreadyOpenView from '@/views/AlreadyOpenView.vue'

type Callback = (lock: object | null) => unknown

/** Faux `navigator.locks` : un verrou par nom, tenu tant que la page vit. */
function createFakeLocks() {
  const held = new Set<string>()
  return {
    request: vi.fn(async (name: string, options: { ifAvailable?: boolean }, callback: Callback) => {
      expect(options.ifAvailable).toBe(true)
      if (held.has(name)) {
        return callback(null)
      }
      held.add(name)
      return callback({ name })
    }),
  }
}

describe('acquireSingleInstance', () => {
  it('donne la main à la première page et la refuse à la seconde', async () => {
    const locks = createFakeLocks()
    expect(await acquireSingleInstance(locks as never)).toBe(true)
    expect(await acquireSingleInstance(locks as never)).toBe(false)
    expect(locks.request).toHaveBeenCalledWith(
      ROOM_LOCK_NAME,
      { ifAvailable: true },
      expect.any(Function)
    )
  })

  it('démarre normalement sans navigator.locks', async () => {
    expect(await acquireSingleInstance(undefined)).toBe(true)
  })

  it('démarre normalement si le navigateur refuse le verrou', async () => {
    const throwing = {
      request: () => {
        throw new DOMException('insecure', 'SecurityError')
      },
    }
    const rejecting = { request: () => Promise.reject(new Error('refusé')) }
    expect(await acquireSingleInstance(throwing as never)).toBe(true)
    expect(await acquireSingleInstance(rejecting as never)).toBe(true)
  })
})

describe('AlreadyOpenView', () => {
  afterEach(() => setCurrentLocale('fr'))

  it.each([
    ['fr', 'QuizzUp est déjà ouvert sur ce PC'],
    ['en', 'QuizzUp is already open on this PC'],
  ] as const)('affiche le message en %s', async (locale, title) => {
    setCurrentLocale(locale)
    await nextTick()
    const wrapper = mount(AlreadyOpenView, { global: { plugins: [createAppI18n()] } })
    expect(wrapper.text()).toContain(title)
  })
})
