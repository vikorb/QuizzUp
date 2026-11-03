import { createUniverse, encodeRawDmxFrame, encodeUsbProFrame } from '@hardware/dmx/universe'

describe('trames DMX', () => {
  it('encode une trame DMX USB Pro (label 6)', () => {
    const universe = createUniverse()
    universe[0] = 10
    universe[511] = 255
    const packet = encodeUsbProFrame(universe)
    expect(packet).toHaveLength(518)
    expect([...packet.subarray(0, 5)]).toEqual([0x7e, 0x06, 0x01, 0x02, 0x00])
    expect(packet[5]).toBe(10)
    expect(packet[516]).toBe(255)
    expect(packet[517]).toBe(0xe7)
  })

  it('encode une trame brute Open DMX avec start code', () => {
    const universe = createUniverse()
    universe[2] = 42
    const packet = encodeRawDmxFrame(universe)
    expect(packet).toHaveLength(513)
    expect(packet[0]).toBe(0)
    expect(packet[3]).toBe(42)
  })
})
