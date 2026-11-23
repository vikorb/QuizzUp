import type { ThemeScope } from '@quizzup/shared'

/** Erreur d'une ligne du fichier ; `column` est le nom de colonne du fichier (ou null). */
export type QuestionImportRowError = {
  line: number
  column: string | null
  code: string
}

export type QuestionImportRequest = {
  file: File
  dryRun: boolean
  /** Superadmin seulement : les autres rôles importent toujours dans leur compagnie. */
  scope?: ThemeScope
  companyId?: number | null
}

export type QuestionImportResult =
  | {
      ok: true
      dryRun: true
      rows: number
      valid: number
      errors: QuestionImportRowError[]
    }
  | { ok: true; dryRun: false; created: number }
  | {
      ok: false
      /** Code stable, traduit par `questionImport.errors.<code>`. */
      code: string
      /** Erreurs par ligne (réponse 422 seulement). */
      errors: QuestionImportRowError[]
      /** Valeurs du serveur insérées dans le texte du code (`column`, `line`). */
      params: Record<string, string | number>
    }
