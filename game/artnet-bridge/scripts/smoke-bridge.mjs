// Test de fumée de l'exécutable du pont : `node scripts/smoke-bridge.mjs <exécutable> [origine]`.
// Lance le binaire, vérifie qu'une connexion WebSocket depuis l'origine autorisée reçoit l'ack du
// `hello`, et qu'une autre origine est refusée (403). Fonctionne sous Windows comme sous Linux.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { request } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'

const [exe, origin = 'http://localhost:4174'] = process.argv.slice(2)
if (!exe) {
  console.error('Usage : node scripts/smoke-bridge.mjs <exécutable> [origine]')
  process.exit(2)
}
const PORT = 17_654

/** Poignée de main WebSocket brute (le WebSocket de Node 22 n'envoie pas d'en-tête Origin). */
function handshake(fromOrigin) {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port: PORT,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        Origin: fromOrigin,
      },
    })
    req.on('upgrade', (_res, socket) => resolve({ status: 101, socket }))
    req.on('response', (res) => {
      res.resume()
      resolve({ status: res.statusCode })
    })
    req.on('error', reject)
    req.end()
  })
}

/** Envoie le hello (trame texte masquée, < 126 octets) ; renvoie le texte de la première réponse. */
function sendHelloAndReadAck(socket) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify({ type: 'hello', protocol: 1, universe: 0 }))
    const mask = randomBytes(4)
    const masked = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]))
    socket.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]))
    const timer = setTimeout(() => reject(new Error("pas d'ack du pont")), 5000)
    socket.once('data', (chunk) => {
      clearTimeout(timer)
      // Trame serveur non masquée ; l'ack tient dans un seul segment TCP.
      const extended = (chunk[1] & 0x7f) === 126
      const start = extended ? 4 : 2
      const length = extended ? chunk.readUInt16BE(2) : chunk[1] & 0x7f
      resolve(chunk.subarray(start, start + length).toString('utf8'))
    })
  })
}

async function connectWhenReady(fromOrigin) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await handshake(fromOrigin)
    } catch {
      await sleep(200)
    }
  }
  throw new Error('le pont ne répond pas sur 127.0.0.1')
}

const child = spawn(exe, ['--origin', origin, '--port', String(PORT)], { stdio: 'inherit' })
child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

let failure
try {
  const accepted = await connectWhenReady(origin)
  if (accepted.status !== 101) {
    throw new Error(`origine ${origin} : statut ${accepted.status} au lieu de 101`)
  }
  const ack = JSON.parse(await sendHelloAndReadAck(accepted.socket))
  if (ack.type !== 'ack' || ack.bridge !== 'quizzup-artnet-bridge') {
    throw new Error(`réponse inattendue au hello : ${JSON.stringify(ack)}`)
  }
  console.log(`OK : ack reçu (pont ${ack.bridge} ${ack.version})`)
  accepted.socket.destroy()

  const refused = await handshake('http://evil.example')
  if (refused.status !== 403) {
    throw new Error(`autre origine : statut ${refused.status} au lieu de 403`)
  }
  console.log('OK : autre origine refusée (403)')
} catch (error) {
  failure = error
} finally {
  child.kill()
}
if (failure) {
  console.error(`ÉCHEC : ${failure.message}`)
  process.exit(1)
}
