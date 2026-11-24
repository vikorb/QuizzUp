import type { QuestionMediaProvider } from '@quizzup/shared'

export type QuestionScope = 'global' | 'company'
export type ThemeMode = 'classic' | 'image' | 'audio' | 'mixed'
export type QuestionMediaType = 'none' | 'image' | 'audio' | 'video'

/** Type de question, utilisé par le moteur pour l'éligibilité des mini-jeux. */
export type QuestionKind = 'qcm' | 'true_false' | 'estimate'

export interface Theme {
  id: number
  adminId: number
  companyId: number | null
  scope: QuestionScope
  name: string
  mode: ThemeMode
  status: number
  createdAt?: string
  updatedAt?: string | null
  deletedAt?: string | null
}

export interface Answer {
  id?: number
  adminId?: number
  questionId?: number
  response: string
  isCorrect: boolean
  status?: number
}

/** Fichier audio uploadé (US-MEDIA-01) : l'URL est relative à l'API et protégée. */
export interface QuestionMediaFile {
  url: string
  mimeType: string
  sizeBytes: number
  durationMs: number | null
  originalName: string | null
  uploadedAt: string | null
}

/** Titre trouvé chez le fournisseur d'extraits (`GET /media-catalog/tracks`). */
export interface MediaCatalogTrack {
  provider: QuestionMediaProvider
  ref: string
  title: string
  artist: string
  album: string
  coverUrl: string | null
  previewUrl: string | null
  link: string | null
}

export interface Question {
  id: number
  adminId: number
  companyId: number | null
  themeId: number | null
  themeIds?: number[]
  themes?: Theme[]
  themeName?: string | null
  themeMode?: ThemeMode | null
  themeScope?: QuestionScope | null
  scope: QuestionScope
  question: string
  kind?: QuestionKind
  typeMedia: QuestionMediaType
  mediaUrl: string | null
  mediaStartMs?: number
  mediaFile?: QuestionMediaFile | null
  /** Extrait fourni par un service d'extraits, à la place d'un fichier importé. */
  mediaProvider?: QuestionMediaProvider | null
  mediaProviderRef?: string | null
  /** « artiste — titre » enregistré au rattachement ; `null` hors titre de fournisseur. */
  mediaProviderLabel?: string | null
  status: number
  canEdit?: boolean
  answers?: Answer[]
  createdAt?: string
  updatedAt?: string | null
  deletedAt?: string | null
}

export interface QuestionFilters {
  search: string
  themeId: string
  status: string
  typeMedia: string
  scope: string
}

export interface QuestionPayload {
  themeIds: number[]
  question: string
  kind: QuestionKind
  typeMedia: QuestionMediaType
  mediaUrl: string | null
  answers: Answer[]
  status?: number
}

export type UpdateQuestionStatusResult =
  | {
      ok: true
      question: Question
    }
  | {
      ok: false
      error: string
    }

/** État du champ audio du formulaire question, envoyé à l'API après l'enregistrement. */
export interface QuestionAudioState {
  file: File | null
  durationMs: number | null
  /** Durée du fichier choisi en cours de lecture par le navigateur. */
  measuring: boolean
  startMs: number
  rightsAttested: boolean
  removeExisting: boolean
  /** Titre choisi dans la recherche, rattaché à la question à l'enregistrement. */
  track: MediaCatalogTrack | null
}
