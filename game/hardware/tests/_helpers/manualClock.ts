import type { Clock, TimerHandle } from '@hardware/clock'

type Timer = { id: number; at: number; every: number | null; callback: () => void }

export type ManualClock = Clock & {
  /** Avance le temps en déclenchant les minuteurs échus, dans l'ordre. */
  advance: (ms: number) => void
  /** Saute dans le temps sans déclencher les minuteurs (page gelée). */
  jump: (ms: number) => void
  pending: () => number
}

export function createManualClock(start = 1_000): ManualClock {
  let now = start
  let nextId = 1
  const timers = new Map<number, Timer>()

  const schedule = (callback: () => void, ms: number, every: number | null): TimerHandle => {
    const id = nextId
    nextId += 1
    timers.set(id, { id, at: now + Math.max(0, ms), every, callback })
    return id as unknown as TimerHandle
  }
  const cancel = (handle: TimerHandle) => {
    timers.delete(handle as unknown as number)
  }

  return {
    now: () => now,
    setTimeout: (callback, ms) => schedule(callback, ms, null),
    setInterval: (callback, ms) => schedule(callback, ms, Math.max(1, ms)),
    clearTimeout: cancel,
    clearInterval: cancel,
    advance(ms) {
      const target = now + ms
      for (;;) {
        const due = [...timers.values()]
          .filter((timer) => timer.at <= target)
          .sort((left, right) => left.at - right.at || left.id - right.id)[0]
        if (!due) {
          break
        }
        now = due.at
        if (due.every === null) {
          timers.delete(due.id)
        } else {
          due.at += due.every
        }
        due.callback()
      }
      now = target
    },
    jump(ms) {
      now += ms
      for (const timer of timers.values()) {
        if (timer.at < now) {
          timer.at = now
        }
      }
    },
    pending: () => timers.size,
  }
}

/** Laisse les promesses en attente se résoudre (écritures DMX asynchrones). */
export const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
