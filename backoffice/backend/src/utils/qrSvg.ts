import qrcode from 'qrcode-generator'

/** Marge blanche autour du code, en modules (minimum de la norme). */
const QUIET_ZONE_MODULES = 4

/**
 * QR code en SVG autonome (sans script ni ressource externe) : modules noirs sur fond blanc,
 * marge de 4 modules, correction d'erreur M. Une seule unité par module (`viewBox`) : l'appelant
 * fixe la taille par CSS. Chaque suite de modules noirs d'une ligne est un trait de `<path>`.
 * Couleurs en toutes lettres, jamais `#fff` : le SVG ne contient aucun `#`, qui ouvrirait le
 * fragment d'une adresse `data:` non encodée. Pour une image :
 * `data:image/svg+xml;charset=utf-8,` + `encodeURIComponent(svg)`.
 */
export function qrSvg(text: string): string {
  const code = qrcode(0, 'M')
  // La bibliothèque garde un octet par caractère (`charCode & 0xff`) : on lui passe les octets
  // UTF-8 du texte, un par caractère, pour que `é` ou `€` restent lisibles.
  code.addData(Buffer.from(text, 'utf8').toString('latin1'), 'Byte')
  code.make()

  const count = code.getModuleCount()
  const size = count + QUIET_ZONE_MODULES * 2
  let path = ''

  for (let row = 0; row < count; row += 1) {
    let col = 0

    while (col < count) {
      if (!code.isDark(row, col)) {
        col += 1
        continue
      }

      const start = col

      while (col < count && code.isDark(row, col)) {
        col += 1
      }

      path += `M${start + QUIET_ZONE_MODULES} ${row + QUIET_ZONE_MODULES}h${col - start}v1h-${col - start}z`
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="white"/><path fill="black" d="${path}"/></svg>`
  )
}
