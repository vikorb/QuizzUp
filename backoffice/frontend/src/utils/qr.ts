/**
 * Adresse `data:` d'un QR code SVG fourni par le serveur, à mettre dans le `src` d'un `<img>`.
 * Jamais de `v-html` : dans une image, un SVG ne peut exécuter aucun script.
 * Champ absent, nul ou vide : `null`, l'appelant affiche alors l'information en clair.
 */
export function getQrSvgSrc(qrSvg: string | null | undefined): string | null {
  return qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}` : null
}
