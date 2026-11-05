export type PollReplyFields = {
  ip: string
  shortName?: string
  longName?: string
  net?: number
  subnet?: number
  /** Un port par entrée : octet PortTypes (0x80 = sortie DMX) et SwOut (univers 0-15). */
  ports?: { type: number; swOut: number }[]
}

/**
 * ArtPollReply de référence, 239 octets (Art-Net 4), construit champ par champ aux positions de la
 * spécification : 0-7 « Art-Net\0 », 8-9 OpCode 0x2100 (petit-boutiste), 10-13 IP, 14-15 Port 0x1936
 * (petit-boutiste), 16-17 VersInfo, 18 NetSwitch, 19 SubSwitch, 26-43 ShortName[18], 44-107
 * LongName[64], 108-171 NodeReport[64], 172-173 NumPorts (gros-boutiste), 174-177 PortTypes[4],
 * 178-181 GoodInput[4], 182-185 GoodOutputA[4], 186-189 SwIn[4], 190-193 SwOut[4], 200 Style.
 */
export function buildPollReply(fields: PollReplyFields, length = 239): Buffer {
  const buffer = Buffer.alloc(239)
  buffer.write('Art-Net\0', 0, 'latin1')
  buffer.writeUInt16LE(0x2100, 8)
  Buffer.from(fields.ip.split('.').map(Number)).copy(buffer, 10)
  buffer.writeUInt16LE(0x1936, 14)
  buffer[18] = fields.net ?? 0
  buffer[19] = fields.subnet ?? 0
  buffer.write(fields.shortName ?? 'Node', 26, 18, 'latin1')
  buffer.write(fields.longName ?? 'Node long name', 44, 64, 'latin1')
  buffer.write('#0001 [0000] Power On Tests successful', 108, 64, 'latin1')
  const ports = fields.ports ?? []
  buffer.writeUInt16BE(ports.length, 172)
  ports.forEach((port, index) => {
    buffer[174 + index] = port.type
    buffer[190 + index] = port.swOut
  })
  buffer[200] = 0x00 // StNode
  return buffer.subarray(0, length)
}
