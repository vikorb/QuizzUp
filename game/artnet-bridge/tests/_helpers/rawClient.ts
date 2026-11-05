import { randomBytes } from 'node:crypto'
import { createSocket, type Socket as UdpSocket } from 'node:dgram'
import { connect, type Socket } from 'node:net'

export type ServerFrame = { fin: boolean; opcode: number; payload: Buffer }

export type RawClient = {
  status: number
  headers: string
  body: string
  socket: Socket
  /** Envoie une trame client (masquée par défaut, comme un navigateur). */
  send: (
    opcode: number,
    payload: Uint8Array | string,
    options?: { fin?: boolean; mask?: boolean }
  ) => void
  sendRaw: (bytes: Uint8Array) => void
  /** Attend la prochaine trame du serveur. */
  next: (timeoutMs?: number) => Promise<ServerFrame>
  /** Attend la fermeture TCP. */
  closed: () => Promise<void>
}

export const OPCODE = { text: 1, binary: 2, close: 8, ping: 9, pong: 10, continuation: 0 } as const

export function encodeClientFrame(
  opcode: number,
  payload: Uint8Array,
  { fin = true, mask = true }: { fin?: boolean; mask?: boolean } = {}
): Buffer {
  const length = payload.length
  const parts: number[] = [(fin ? 0x80 : 0) | opcode]
  const maskBit = mask ? 0x80 : 0
  if (length < 126) {
    parts.push(maskBit | length)
  } else if (length < 65_536) {
    parts.push(maskBit | 126, length >> 8, length & 0xff)
  } else {
    parts.push(
      maskBit | 127,
      0,
      0,
      0,
      0,
      (length >>> 24) & 0xff,
      (length >> 16) & 0xff,
      (length >> 8) & 0xff,
      length & 0xff
    )
  }
  const header = Buffer.from(parts)
  if (!mask) {
    return Buffer.concat([header, payload])
  }
  const key = randomBytes(4)
  const body = Buffer.from(payload)
  for (let index = 0; index < body.length; index += 1) {
    body[index]! ^= key[index & 3]!
  }
  return Buffer.concat([header, key, body])
}

/** Client WebSocket écrit à la main : contrôle total des en-têtes et des trames envoyées. */
export function openRawClient(
  port: number,
  headers: Record<string, string | undefined> = {}
): Promise<RawClient> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1')
    let buffer = Buffer.alloc(0)
    let handshakeDone = false
    const frames: ServerFrame[] = []
    const waiters: ((frame: ServerFrame) => void)[] = []
    let ended = false
    const endWaiters: (() => void)[] = []

    const all: Record<string, string | undefined> = {
      Host: `127.0.0.1:${port}`,
      Upgrade: 'websocket',
      Connection: 'Upgrade',
      'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
      'Sec-WebSocket-Version': '13',
      Origin: 'https://salle.quizzup.fr',
      ...headers,
    }
    const lines = Object.entries(all)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => `${name}: ${value}`)
    socket.write(`GET / HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`)

    const parseFrames = () => {
      for (;;) {
        if (buffer.length < 2) {
          return
        }
        let length = buffer[1]! & 0x7f
        let offset = 2
        if (length === 126) {
          length = buffer.readUInt16BE(2)
          offset = 4
        }
        if (buffer.length < offset + length) {
          return
        }
        const frame = {
          fin: (buffer[0]! & 0x80) !== 0,
          opcode: buffer[0]! & 0x0f,
          payload: Buffer.from(buffer.subarray(offset, offset + length)),
        }
        buffer = buffer.subarray(offset + length)
        const waiter = waiters.shift()
        if (waiter) {
          waiter(frame)
        } else {
          frames.push(frame)
        }
      }
    }

    const client: RawClient = {
      status: 0,
      headers: '',
      body: '',
      socket,
      send(opcode, payload, options) {
        const bytes = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload
        socket.write(encodeClientFrame(opcode, bytes, options))
      },
      sendRaw(bytes) {
        socket.write(bytes)
      },
      next(timeoutMs = 2000) {
        const ready = frames.shift()
        if (ready) {
          return Promise.resolve(ready)
        }
        return new Promise((resolveFrame, rejectFrame) => {
          const timer = setTimeout(
            () => rejectFrame(new Error('aucune trame du serveur')),
            timeoutMs
          )
          waiters.push((frame) => {
            clearTimeout(timer)
            resolveFrame(frame)
          })
        })
      },
      closed() {
        return ended ? Promise.resolve() : new Promise((resolveEnd) => endWaiters.push(resolveEnd))
      },
    }

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (!handshakeDone) {
        const end = buffer.indexOf('\r\n\r\n')
        if (end === -1) {
          return
        }
        const head = buffer.subarray(0, end).toString('utf8')
        client.status = Number(head.split(' ')[1])
        client.headers = head
        buffer = buffer.subarray(end + 4)
        handshakeDone = true
        if (client.status !== 101) {
          socket.once('close', () => {
            client.body = buffer.toString('utf8')
            resolve(client)
          })
          return
        }
        resolve(client)
      }
      if (client.status === 101) {
        parseFrames()
      }
    })
    socket.on('close', () => {
      ended = true
      for (const waiter of endWaiters.splice(0)) {
        waiter()
      }
    })
    socket.on('error', reject)
  })
}

export type UdpReceiver = {
  port: number
  packets: Buffer[]
  /** Attend qu'au moins `count` paquets soient arrivés. */
  waitFor: (count: number, timeoutMs?: number) => Promise<Buffer[]>
  close: () => Promise<void>
}

/** Faux nœud Art-Net : écoute en UDP sur 127.0.0.1 (port choisi par le système). */
/**
 * `reply` : réponses automatiques à chaque paquet reçu, renvoyées à l'expéditeur (comme un nœud
 * qui répond à un ArtPoll).
 */
export function openUdpReceiver(reply?: (message: Buffer) => Buffer[]): Promise<UdpReceiver> {
  return new Promise((resolve) => {
    const socket: UdpSocket = createSocket('udp4')
    const packets: Buffer[] = []
    const listeners: (() => void)[] = []
    socket.on('message', (message, remote) => {
      packets.push(message)
      for (const answer of reply?.(message) ?? []) {
        socket.send(answer, remote.port, remote.address)
      }
      for (const listener of [...listeners]) {
        listener()
      }
    })
    socket.bind(0, '127.0.0.1', () => {
      resolve({
        port: socket.address().port,
        packets,
        waitFor(count, timeoutMs = 2000) {
          if (packets.length >= count) {
            return Promise.resolve(packets)
          }
          return new Promise((resolveWait, rejectWait) => {
            const timer = setTimeout(
              () =>
                rejectWait(new Error(`${packets.length} paquet(s) reçu(s), ${count} attendu(s)`)),
              timeoutMs
            )
            const listener = () => {
              if (packets.length >= count) {
                clearTimeout(timer)
                listeners.splice(listeners.indexOf(listener), 1)
                resolveWait(packets)
              }
            }
            listeners.push(listener)
          })
        },
        close: () => new Promise((resolveClose) => socket.close(() => resolveClose())),
      })
    })
  })
}
