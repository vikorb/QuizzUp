import { PassThrough } from 'node:stream'

import { computeAcceptKey, encodeFrame, rejectUpgrade } from '@bridge/websocket'

describe('WebSocket minimal', () => {
  it('calcule Sec-WebSocket-Accept comme la RFC 6455', () => {
    // Exemple de la RFC 6455, section 1.3.
    expect(computeAcceptKey('dGhlIHNhbXBsZSBub25jZQ==')).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
  })

  it('encode les trois tailles de longueur, sans masque', () => {
    const small = encodeFrame(0x1, Buffer.from('ok'))
    expect([...small]).toEqual([0x81, 2, 0x6f, 0x6b])
    const medium = encodeFrame(0x2, new Uint8Array(515))
    expect([...medium.subarray(0, 4)]).toEqual([0x82, 126, 0x02, 0x03])
    expect(medium.length).toBe(519)
    const large = encodeFrame(0x2, new Uint8Array(70_000))
    expect(large[1]).toBe(127)
    expect(large.readBigUInt64BE(2)).toBe(70_000n)
  })

  it('répond une erreur HTTP lisible', () => {
    const socket = new PassThrough()
    const chunks: Buffer[] = []
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    rejectUpgrade(socket, 418, 'Théière')
    const text = Buffer.concat(chunks).toString('utf8')
    expect(text.startsWith('HTTP/1.1 418 Error\r\n')).toBe(true)
    expect(text).toContain(`Content-Length: ${Buffer.byteLength('Théière\n')}`)
    expect(text.endsWith('\r\n\r\nThéière\n')).toBe(true)
  })
})
