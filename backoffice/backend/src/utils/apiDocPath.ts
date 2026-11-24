import fs from 'node:fs'
import path from 'node:path'

export const OPENAPI_FILE = 'openapi.yaml'
export const PUBLIC_OPENAPI_FILE = 'public-v1.yaml'

/**
 * Chemin d'un contrat OpenAPI du dossier `docs/api` (`openapi.yaml` par défaut). `OPENAPI_PATH`
 * désigne `openapi.yaml` ; les autres contrats sont cherchés dans son dossier. Erreur claire au
 * démarrage si le fichier est introuvable.
 */
export function resolveApiDocPath(fileName = OPENAPI_FILE) {
  if (process.env.OPENAPI_PATH) {
    const configured = path.resolve(process.env.OPENAPI_PATH)
    const resolved =
      fileName === OPENAPI_FILE ? configured : path.join(path.dirname(configured), fileName)

    if (fileName === OPENAPI_FILE || fs.existsSync(resolved)) return resolved

    throw new Error(`${fileName} not found next to OPENAPI_PATH: ${resolved}`)
  }

  const candidates = [
    path.resolve(process.cwd(), 'docs/api', fileName),
    path.resolve(process.cwd(), '../docs/api', fileName),
    path.resolve(process.cwd(), 'docs/db', fileName),
    path.resolve(process.cwd(), '../docs/db', fileName),
  ]

  const found = candidates.find((candidate) => fs.existsSync(candidate))

  if (!found) {
    throw new Error(`${fileName} not found. Tried: ${candidates.join(', ')}`)
  }

  return found
}
