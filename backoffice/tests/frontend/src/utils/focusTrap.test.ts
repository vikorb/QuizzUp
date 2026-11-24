import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { trapTabKey } from '@/utils/focusTrap'

let outside: HTMLButtonElement
let container: HTMLDivElement
let first: HTMLButtonElement
let middle: HTMLInputElement
let last: HTMLButtonElement

beforeEach(() => {
  document.body.innerHTML = `
    <button id="outside">outside</button>
    <div id="dialog">
      <button id="first">first</button>
      <button disabled id="disabled">disabled</button>
      <input id="middle" />
      <button id="last">last</button>
    </div>`
  outside = document.getElementById('outside') as HTMLButtonElement
  container = document.getElementById('dialog') as HTMLDivElement
  first = document.getElementById('first') as HTMLButtonElement
  middle = document.getElementById('middle') as HTMLInputElement
  last = document.getElementById('last') as HTMLButtonElement
})

afterEach(() => {
  document.body.innerHTML = ''
})

function press(
  key: string,
  shiftKey = false,
  target: HTMLElement | null = container
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })

  trapTabKey(event, target)

  return event
}

describe('utils/focusTrap.ts', () => {
  it('sends Tab from the last element back to the first', () => {
    last.focus()

    expect(press('Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
  })

  it('sends Shift+Tab from the first element to the last, skipping disabled ones', () => {
    first.focus()

    expect(press('Tab', true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
  })

  it('leaves Tab alone between the two ends', () => {
    middle.focus()

    expect(press('Tab').defaultPrevented).toBe(false)
    expect(press('Tab', true).defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(middle)
  })

  it('brings a focus that fell outside the dialog back to its first element', () => {
    outside.focus()

    expect(press('Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
  })

  it('ignores the other keys', () => {
    last.focus()

    expect(press('Enter').defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(last)
  })

  it('does nothing without a dialog or without a focusable element', () => {
    last.focus()
    expect(press('Tab', false, null).defaultPrevented).toBe(false)

    const empty = document.createElement('div')

    document.body.append(empty)
    expect(press('Tab', false, empty).defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(last)
  })
})
