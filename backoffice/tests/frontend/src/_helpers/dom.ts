import { nextTick } from 'vue'

export async function setViewportWidth(width: number): Promise<void> {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })

  window.dispatchEvent(new Event('resize'))
  await nextTick()
}
