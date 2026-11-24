export function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  })
}

const REVOKE_DELAY_MS = 1000

/** Propose un fichier au téléchargement (réponse d'une route authentifiée, hors d'un simple lien). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()

  // Le navigateur lit l'adresse après le clic : la libérer tout de suite peut couper le téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
