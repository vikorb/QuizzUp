import '../_helpers/registerDbMock'

import { EventEmitter } from 'node:events'

import { openSseStream } from '@backend/routes/live/_stream'
import { ADMIN_ROLE_ADMIN, LIVE_EVENT } from '@quizzup/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

function open(onClose: () => void) {
  const req = { user: { sub: '2', sid: 'sid', role: ADMIN_ROLE_ADMIN }, log: { warn: vi.fn() } }
  const reply = { raw: new EventEmitter(), header: () => reply }

  return openSseStream(req as never, reply as never, onClose)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('routes/live/_stream.ts write buffer', () => {
  it('closes the stream instead of writing once more than 1 MiB waits unread', () => {
    vi.useFakeTimers()

    const onClose = vi.fn()
    const sse = open(onClose)
    const chunk = 'x'.repeat(600_000)

    // Personne ne lit le flux : le tampon d'écriture grossit.
    sse.send(LIVE_EVENT.SNAPSHOT, chunk)
    sse.send(LIVE_EVENT.SNAPSHOT, chunk)
    expect(onClose).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(2)

    const buffered = sse.stream.writableLength

    sse.send(LIVE_EVENT.SNAPSHOT, 'one more')

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(sse.stream.writableLength).toBe(buffered)
    expect(sse.stream.writableEnded).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    // Un flux fermé n'écrit plus et ne se ferme pas deux fois.
    sse.send(LIVE_EVENT.SNAPSHOT, 'again')
    sse.close()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
