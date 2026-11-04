import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

/**
 * Serveur WebSocket minimal (RFC 6455), côté serveur uniquement, écrit avec `node:http` et
 * `node:crypto` pour que le pont n'ait **aucune dépendance d'exécution**.
 *
 * Volontairement limité à ce dont le pont a besoin : messages texte et binaires courts
 * (fragmentation acceptée), ping/pong, fermeture propre. Pas d'extension (permessage-deflate
 * n'est jamais négocié), pas de sous-protocole.
 */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const OPCODES = {
  continuation: 0x0,
  text: 0x1,
  binary: 0x2,
  close: 0x8,
  ping: 0x9,
  pong: 0xa,
} as const

/** Délai laissé au client pour répondre à notre trame de fermeture avant de couper la socket. */
const CLOSE_GRACE_MS = 1000

export type WsMessage = { kind: 'text'; data: string } | { kind: 'binary'; data: Uint8Array }

export type WsConnection = {
  sendText: (text: string) => void
  /** Ferme proprement (trame de fermeture) puis coupe la socket. Idempotent. */
  close: (code?: number, reason?: string) => void
  onMessage: (listener: (message: WsMessage) => void) => void
  onClose: (listener: (code: number, reason: string) => void) => void
  isOpen: () => boolean
}

export function computeAcceptKey(key: string): string {
  return createHash('sha1')
    .update(key + GUID)
    .digest('base64')
}

/** Répond une erreur HTTP à une demande de mise à niveau refusée, puis coupe. */
export function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  const body = `${message}\n`
  const reasons: Record<number, string> = {
    400: 'Bad Request',
    403: 'Forbidden',
    409: 'Conflict',
    426: 'Upgrade Required',
  }
  socket.end(
    `HTTP/1.1 ${status} ${reasons[status] ?? 'Error'}\r\n` +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n\r\n' +
      body
  )
}

/** Encode une trame serveur → client (jamais masquée). */
export function encodeFrame(opcode: number, payload: Uint8Array): Buffer {
  const length = payload.length
  let header: Buffer
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length])
  } else if (length < 0x1_00_00) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  return Buffer.concat([header, payload])
}

const closePayload = (code: number, reason: string) => {
  const text = Buffer.from(reason, 'utf8').subarray(0, 123)
  const payload = Buffer.alloc(2 + text.length)
  payload.writeUInt16BE(code, 0)
  text.copy(payload, 2)
  return payload
}

const isValidCloseCode = (code: number) =>
  (code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999)

export type UpgradeOptions = {
  /** Taille maximale d'un message (fragments réassemblés compris). */
  maxPayload: number
  setTimeout?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>
}

/**
 * Termine la poignée de main (réponse 101) et renvoie la connexion, ou répond 400 et renvoie
 * `null` si la demande n'est pas une mise à niveau WebSocket valide.
 */
export function acceptUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  options: UpgradeOptions
): WsConnection | null {
  const key = request.headers['sec-websocket-key']
  const upgrade = request.headers.upgrade
  if (
    request.method !== 'GET' ||
    typeof upgrade !== 'string' ||
    upgrade.toLowerCase() !== 'websocket' ||
    request.headers['sec-websocket-version'] !== '13' ||
    typeof key !== 'string' ||
    Buffer.from(key, 'base64').length !== 16
  ) {
    rejectUpgrade(socket, 400, 'Requête WebSocket invalide')
    return null
  }

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${computeAcceptKey(key)}\r\n\r\n`
  )
  return createConnection(socket, head, options)
}

function createConnection(socket: Duplex, head: Buffer, options: UpgradeOptions): WsConnection {
  const schedule = options.setTimeout ?? setTimeout
  const messageListeners: ((message: WsMessage) => void)[] = []
  const closeListeners: ((code: number, reason: string) => void)[] = []
  let buffer: Buffer = head.length > 0 ? Buffer.from(head) : Buffer.alloc(0)
  let fragments: Buffer[] = []
  let fragmentOpcode: number | null = null
  let fragmentBytes = 0
  let closeSent = false
  let finished = false
  let closeCode = 1006
  let closeReason = ''

  const finish = () => {
    if (finished) {
      return
    }
    finished = true
    for (const listener of closeListeners) {
      listener(closeCode, closeReason)
    }
  }

  const write = (frame: Buffer) => {
    if (!closeSent && !socket.destroyed && socket.writable) {
      socket.write(frame)
    }
  }

  const close = (code = 1000, reason = '') => {
    if (closeSent || finished) {
      return
    }
    if (socket.writable) {
      socket.write(encodeFrame(OPCODES.close, closePayload(code, reason)))
    }
    closeSent = true
    closeCode = code
    closeReason = reason
    const timer = schedule(() => socket.destroy(), CLOSE_GRACE_MS)
    timer.unref?.()
  }

  const emit = (message: WsMessage) => {
    for (const listener of messageListeners) {
      listener(message)
    }
  }

  const deliver = (opcode: number, payload: Buffer) => {
    if (opcode === OPCODES.binary) {
      emit({ kind: 'binary', data: new Uint8Array(payload) })
      return true
    }
    try {
      emit({ kind: 'text', data: new TextDecoder('utf-8', { fatal: true }).decode(payload) })
    } catch {
      close(1007, 'Texte UTF-8 invalide')
      return false
    }
    return true
  }

  const handleControl = (opcode: number, payload: Buffer) => {
    if (opcode === OPCODES.ping) {
      write(encodeFrame(OPCODES.pong, payload))
      return
    }
    if (opcode === OPCODES.close) {
      const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005
      const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : ''
      if (!closeSent) {
        // Écho de la fermeture, comme l'exige la RFC, puis fin de la connexion.
        const echo = isValidCloseCode(code) ? code : 1000
        if (socket.writable) {
          socket.write(encodeFrame(OPCODES.close, closePayload(echo, '')))
        }
        closeSent = true
        closeCode = code
        closeReason = reason
      }
      socket.end()
      finish()
    }
    // pong : rien à faire.
  }

  /** Lit autant de trames complètes que possible ; `false` si la connexion doit s'arrêter. */
  const parse = (): boolean => {
    for (;;) {
      if (buffer.length < 2) {
        return true
      }
      const first = buffer[0]!
      const second = buffer[1]!
      const fin = (first & 0x80) !== 0
      const opcode = first & 0x0f
      const masked = (second & 0x80) !== 0
      let length = second & 0x7f
      let offset = 2

      if ((first & 0x70) !== 0) {
        close(1002, 'Extension non négociée')
        return false
      }
      if (!masked) {
        close(1002, 'Trame client non masquée')
        return false
      }
      const control = opcode >= 0x8
      if (control ? opcode > OPCODES.pong || !fin || length > 125 : opcode > OPCODES.binary) {
        close(1002, 'Trame invalide')
        return false
      }
      if (length === 126) {
        if (buffer.length < 4) {
          return true
        }
        length = buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (buffer.length < 10) {
          return true
        }
        const big = buffer.readBigUInt64BE(2)
        length = big > BigInt(options.maxPayload) ? options.maxPayload + 1 : Number(big)
        offset = 10
      }
      if (
        length > options.maxPayload ||
        (!control && fragmentBytes + length > options.maxPayload)
      ) {
        close(1009, 'Message trop long')
        return false
      }
      if (buffer.length < offset + 4 + length) {
        return true
      }
      const mask = buffer.subarray(offset, offset + 4)
      const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length))
      for (let index = 0; index < payload.length; index += 1) {
        payload[index]! ^= mask[index & 3]!
      }
      buffer = buffer.subarray(offset + 4 + length)

      if (control) {
        handleControl(opcode, payload)
        if (finished) {
          return false
        }
        continue
      }
      if (opcode === OPCODES.continuation) {
        if (fragmentOpcode === null) {
          close(1002, 'Fragment inattendu')
          return false
        }
      } else if (fragmentOpcode !== null) {
        close(1002, 'Message fragmenté interrompu')
        return false
      }
      if (closeSent) {
        // Fermeture en cours : on ignore les données encore en route.
        continue
      }
      if (!fin) {
        fragmentOpcode ??= opcode
        fragments.push(payload)
        fragmentBytes += payload.length
        continue
      }
      const messageOpcode = fragmentOpcode ?? opcode
      const message = fragmentOpcode === null ? payload : Buffer.concat([...fragments, payload])
      fragments = []
      fragmentOpcode = null
      fragmentBytes = 0
      if (!deliver(messageOpcode, message)) {
        return false
      }
    }
  }

  if (buffer.length > 0) {
    // Données arrivées avec la requête : analysées une fois les abonnés posés par l'appelant.
    queueMicrotask(() => {
      if (!finished) {
        parse()
      }
    })
  }

  socket.on('data', (chunk: Buffer) => {
    if (finished) {
      return
    }
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])
    parse()
  })
  socket.on('close', finish)
  socket.on('end', () => socket.end())
  socket.on('error', () => {
    // ECONNRESET (onglet fermé brutalement) : la fermeture est signalée par `close`.
  })

  return {
    sendText: (text) => write(encodeFrame(OPCODES.text, Buffer.from(text, 'utf8'))),
    close,
    onMessage: (listener) => {
      messageListeners.push(listener)
    },
    onClose: (listener) => {
      closeListeners.push(listener)
    },
    isOpen: () => !closeSent && !finished,
  }
}
