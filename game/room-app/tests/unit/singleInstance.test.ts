import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import { createAppI18n, setCurrentLocale } from '@/plugins/i18n'
import { guardSingleInstance, LOCK_FALLBACK_MS, ROOM_LOCK_NAME } from '@/utils/singleInstance'
import AlreadyOpenView from '@/views/AlreadyOpenView.vue'

type Callback = (lock: object | null) => unknown
type Options = { ifAvailable?: boolean }

/**
 * Faux `navigator.locks` : un verrou par nom tenu jusqu'à `releaseAll()` (fermeture de la page),
 * avec file d'attente pour les demandes sans `ifAvailable`.
 */
function createFakeLocks() {
  let held = false
  const waiting: Callback[] = []
  const grant = (callback: Callback) => {
    held = true
    return callback({ name: ROOM_LOCK_NAME })
  }
  return {
    request: vi.fn(async (_name: string, ...args: [Options, Callback] | [Callback]) => {
      const [options, callback] = args.length === 2 ? args : [{}, args[0]]
      if (!held) {
        return grant(callback)
      }
      if (options.ifAvailable) {
        return callback(null)
      }
      return new Promise((resolve) => waiting.push((lock) => resolve(callback(lock))))
    }),
    /** La page qui tenait le verrou se ferme : le suivant dans la file l'obtient. */
    releaseAll() {
      held = false
      const next = waiting.shift()
      if (next) {
        held = true
        next({ name: ROOM_LOCK_NAME })
      }
    },
  }
}

function setup(locks: unknown) {
  const start = vi.fn()
  const showBlocked = vi.fn()
  const reload = vi.fn()
  guardSingleInstance({ start, showBlocked, reload, locks: locks as never })
  return { start, showBlocked, reload }
}

describe('guardSingleInstance', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => vi.useRealTimers())

  it('démarre la première page et bloque la seconde sans démarrer la salle', async () => {
    const locks = createFakeLocks()
    const first = setup(locks)
    await vi.advanceTimersByTimeAsync(0)
    expect(first.start).toHaveBeenCalledTimes(1)
    expect(first.showBlocked).not.toHaveBeenCalled()
    expect(locks.request).toHaveBeenCalledWith(
      ROOM_LOCK_NAME,
      { ifAvailable: true },
      expect.any(Function)
    )

    const second = setup(locks)
    await vi.advanceTimersByTimeAsync(0)
    expect(second.showBlocked).toHaveBeenCalledTimes(1)
    expect(second.start).not.toHaveBeenCalled()
    expect(second.reload).not.toHaveBeenCalled()
  })

  it('recharge la page bloquée dès que la première se ferme', async () => {
    const locks = createFakeLocks()
    setup(locks)
    const second = setup(locks)
    await vi.advanceTimersByTimeAsync(0)
    expect(second.showBlocked).toHaveBeenCalledTimes(1)
    expect(second.reload).not.toHaveBeenCalled()

    locks.releaseAll()
    await vi.advanceTimersByTimeAsync(0)
    expect(second.reload).toHaveBeenCalledTimes(1)
    expect(second.start).not.toHaveBeenCalled()
    // L'attente se fait sans `ifAvailable`.
    expect(locks.request).toHaveBeenLastCalledWith(ROOM_LOCK_NAME, expect.any(Function))
  })

  it('démarre normalement sans navigator.locks', () => {
    const { start, showBlocked } = setup(undefined)
    expect(start).toHaveBeenCalledTimes(1)
    expect(showBlocked).not.toHaveBeenCalled()
  })

  it('démarre normalement si le navigateur refuse le verrou', async () => {
    const throwing = setup({
      request: () => {
        throw new DOMException('insecure', 'SecurityError')
      },
    })
    const rejecting = setup({ request: () => Promise.reject(new Error('refusé')) })
    await vi.advanceTimersByTimeAsync(0)
    expect(throwing.start).toHaveBeenCalledTimes(1)
    expect(rejecting.start).toHaveBeenCalledTimes(1)
  })

  it('démarre quand même si le navigateur ne répond jamais (pas d’écran blanc)', async () => {
    const silent = { request: vi.fn(() => new Promise(() => {})) }
    const { start, showBlocked } = setup(silent)

    await vi.advanceTimersByTimeAsync(LOCK_FALLBACK_MS - 1)
    expect(start).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(start).toHaveBeenCalledTimes(1)
    expect(showBlocked).not.toHaveBeenCalled()
  })

  it('n’affiche pas le blocage après un démarrage de secours, et ne démarre pas deux fois', async () => {
    const answers: Callback[] = []
    const late = {
      request: vi.fn((_name: string, _options: Options, callback: Callback) => {
        answers.push(callback)
        return new Promise(() => {})
      }),
    }
    const { start, showBlocked } = setup(late)
    await vi.advanceTimersByTimeAsync(LOCK_FALLBACK_MS)
    answers[0]?.(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(start).toHaveBeenCalledTimes(1)
    expect(showBlocked).not.toHaveBeenCalled()
  })

  it('un verrou obtenu à temps annule le démarrage de secours', async () => {
    const { start } = setup(createFakeLocks())
    await vi.advanceTimersByTimeAsync(LOCK_FALLBACK_MS * 2)
    expect(start).toHaveBeenCalledTimes(1)
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
