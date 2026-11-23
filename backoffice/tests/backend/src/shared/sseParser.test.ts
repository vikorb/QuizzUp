import { describe, expect, it } from 'vitest'

import { createSseParser, type SseMessage } from '@quizzup/shared'

function parse(...chunks: string[]): SseMessage[] {
  const messages: SseMessage[] = []
  const feed = createSseParser((message) => messages.push(message))

  chunks.forEach(feed)

  return messages
}

describe('createSseParser', () => {
  it('emits a complete event', () => {
    expect(parse('event: hello\ndata: {"a":1}\n\n')).toEqual([{ event: 'hello', data: '{"a":1}' }])
  })

  it('waits for the rest of an event cut in two chunks, anywhere', () => {
    const text = 'event: room_status\ndata: {"roomId":1}\n\n'

    for (let cut = 1; cut < text.length; cut += 1) {
      expect(parse(text.slice(0, cut), text.slice(cut))).toEqual([
        { event: 'room_status', data: '{"roomId":1}' },
      ])
    }
  })

  it('does not emit before the blank line', () => {
    expect(parse('event: hello\ndata: x\n')).toEqual([])
  })

  it('handles CRLF line ends, even when the CR and the LF arrive separately', () => {
    const text = 'event: a\r\ndata: 1\r\n\r\nevent: b\r\ndata: 2\r\n\r\n'

    expect(parse(text)).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ])

    for (let cut = 1; cut < text.length; cut += 1) {
      expect(parse(text.slice(0, cut), text.slice(cut))).toHaveLength(2)
    }
  })

  it('ignores comment lines such as pings', () => {
    expect(parse(': ping\n\nevent: a\ndata: 1\n: ping\n\n')).toEqual([{ event: 'a', data: '1' }])
  })

  it('joins several data lines with a line feed', () => {
    expect(parse('data: one\ndata: two\n\n')).toEqual([{ event: 'message', data: 'one\ntwo' }])
  })

  it('names an event without a name "message" and ignores unknown fields', () => {
    expect(parse('id: 7\nretry: 100\ndata:x\n\n')).toEqual([{ event: 'message', data: 'x' }])
  })

  it('does not carry the name of an event over to the next one', () => {
    expect(parse('event: a\ndata: 1\n\ndata: 2\n\n')).toEqual([
      { event: 'a', data: '1' },
      { event: 'message', data: '2' },
    ])
  })

  it('does not emit an event that has no data', () => {
    expect(parse('event: a\n\n\n')).toEqual([])
  })
})
