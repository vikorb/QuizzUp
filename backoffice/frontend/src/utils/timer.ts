export type TimerHandle = ReturnType<typeof setTimeout>

export function clearTimer(timer: TimerHandle | null): null {
  if (timer) {
    clearTimeout(timer)
  }

  return null
}

export function scheduleTimer(
  timer: TimerHandle | null,
  callback: () => void,
  delay = 4000,
): TimerHandle {
  if (timer) {
    clearTimeout(timer)
  }

  return setTimeout(callback, delay)
}
