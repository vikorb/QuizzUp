import { describe, expect, it } from 'vitest'

import { getQrSvgSrc } from '@/utils/qr'

describe('utils/qr', () => {
  it('builds an image address that carries the whole svg, escaped', () => {
    const svg = '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>'
    const src = getQrSvgSrc(svg) ?? ''

    expect(src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(src).not.toMatch(/[<>"\s]/)
    expect(decodeURIComponent(src.slice(src.indexOf(',') + 1))).toBe(svg)
  })

  it.each([[undefined], [null], ['']])('gives no address for %j', (value) => {
    expect(getQrSvgSrc(value)).toBeNull()
  })
})
