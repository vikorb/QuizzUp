/** Les octets de `bytes` se trouvent-ils dans `content`, à partir de `offset` ? */
export function startsWithBytes(content: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, index) => content[offset + index] === byte)
}
