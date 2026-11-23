/**
 * Les huit groupes de 16 bits d'une adresse IPv6 valide (déjà vérifiée par `net.isIP`), forme
 * compressée (`::`), IPv4 intégrée (`::ffff:1.2.3.4`) et zone (`%eth0`, ignorée) comprises.
 */
export function ipv6Groups(ip: string): number[] {
  const [head, tail = ''] = ip.split('%')[0].split('::')
  const toGroups = (part: string) =>
    part === ''
      ? []
      : part.split(':').flatMap((group) => {
          if (!group.includes('.')) return [parseInt(group, 16)]

          const [a, b, c, d] = group.split('.').map(Number)
          return [(a << 8) | b, (c << 8) | d]
        })
  const start = toGroups(head)
  const end = toGroups(tail)

  return ip.includes('::')
    ? [...start, ...Array<number>(8 - start.length - end.length).fill(0), ...end]
    : start
}
