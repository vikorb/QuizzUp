/**
 * Adresse `data:` d'un QR code SVG fourni par le serveur, à mettre dans le `src` d'un `<img>`.
 * Jamais de `v-html` : dans une image, un SVG ne peut exécuter aucun script.
 * Champ absent ou nul (serveur pas à jour, bon sans adresse) : `null`, le code en clair suffit.
 */
export function getVoucherQrSrc(qrSvg: string | null | undefined): string | null {
  return qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}` : null
}
